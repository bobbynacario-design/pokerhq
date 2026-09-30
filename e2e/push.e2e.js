const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1100, height: 1300 } });
  const ok = (m) => console.log("ok  " + m);
  const text = (id) => page.evaluate((i) => document.getElementById(i).textContent.trim(), id);
  const vis = (id) => page.evaluate((i) => { const e = document.getElementById(i); return !!e && e.style.display !== "none" && e.offsetParent !== null; }, id);
  const settle = async () => { await page.evaluate(() => refreshPushUi()); await page.waitForTimeout(50); };

  // ── stubs: registration, permission, server calls ──
  await page.evaluate(() => {
    window.__perm = "default";
    Object.defineProperty(Notification, "permission", { get: () => window.__perm, configurable: true });
    Notification.requestPermission = async () => { window.__asked = (window.__asked || 0) + 1; window.__perm = window.__nextPerm || "granted"; return window.__perm; };
    window.__fake = { sub: null, subscribeOpts: null, unsubscribed: 0 };
    window.pushRegistration = async () => ({ pushManager: {
      getSubscription: async () => window.__fake.sub,
      subscribe: async (opts) => { window.__fake.subscribeOpts = opts; window.__fake.sub = { endpoint: "https://fcm.googleapis.com/fcm/send/test1", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BNc_2mS-AbCdEf0123456789_-xyz", auth: "auth_123-abc" } }; }, unsubscribe: async () => { window.__fake.unsubscribed++; window.__fake.sub = null; return true; } }; return window.__fake.sub; },
    } });
    window.__calls = [];
    // a real-looking 65-byte uncompressed P-256 public key, base64url
    const bytes = new Uint8Array(65); bytes[0] = 4; for (let i = 1; i < 65; i++) bytes[i] = i * 3 % 251;
    window.__vapid = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    window.pokerhqPushCall = async (p) => {
      window.__calls.push(p);
      if (window.__pushError) { const e = new Error(window.__pushError.message); e.code = window.__pushError.code; throw e; }
      if (p.action === "config") return { data: { publicKey: window.__vapid } };
      if (p.action === "test") return { data: window.__testResult || { total: 1, sent: 1, failed: 0, removed: 0 } };
      return { data: { ok: true } };
    };
    switchGroup("plan", "calendar");
  });
  await settle();

  // 1. off
  assert.match(await text("push-status"), /Off on this device/);
  assert.ok(await vis("push-enable-btn"));
  assert.ok(!(await vis("push-test-btn")) && !(await vis("push-disable-btn")));
  ok("off: shows the Enable button only");

  // 2. enable → permission asked from the click, config, subscribe with the device + key
  await page.click("#push-enable-btn");
  await page.waitForFunction(() => /On for this device/.test(document.getElementById("push-status").textContent));
  assert.equal(await page.evaluate(() => window.__asked), 1, "permission requested once");
  const kinds = await page.evaluate(() => window.__calls.map((c) => c.action));
  assert.deepEqual(kinds, ["config", "subscribe"]);
  const sub = await page.evaluate(() => window.__calls[1]);
  assert.equal(sub.subscription.endpoint, "https://fcm.googleapis.com/fcm/send/test1");
  assert.ok(sub.subscription.keys.p256dh && sub.subscription.keys.auth);
  assert.match(sub.device, /^(Linux|Windows|Mac|Device)/);
  const opts = await page.evaluate(() => ({ uvo: window.__fake.subscribeOpts.userVisibleOnly, len: window.__fake.subscribeOpts.applicationServerKey.length, first: window.__fake.subscribeOpts.applicationServerKey[0], isU8: window.__fake.subscribeOpts.applicationServerKey instanceof Uint8Array }));
  assert.deepEqual(opts, { uvo: true, len: 65, first: 4, isU8: true });
  assert.ok(await vis("push-test-btn") && await vis("push-disable-btn"));
  assert.ok(!(await vis("push-enable-btn")));
  ok("enable: asks permission, fetches the server key (decoded to 65 bytes), subscribes, registers the device — now shows Test/Turn off");

  // 3. test
  await page.click("#push-test-btn");
  await page.waitForFunction(() => /Sent/.test(document.getElementById("push-result").textContent));
  assert.equal(await page.evaluate(() => window.__calls[window.__calls.length - 1].endpoint), "https://fcm.googleapis.com/fcm/send/test1");
  await page.evaluate(() => { window.__testResult = { total: 1, sent: 0, failed: 0, removed: 1 }; });
  await page.click("#push-test-btn");
  await page.waitForFunction(() => /no longer registered/.test(document.getElementById("push-result").textContent));
  await page.evaluate(() => { window.__testResult = { total: 1, sent: 0, failed: 1, removed: 0 }; });
  await page.click("#push-test-btn");
  await page.waitForFunction(() => /didn't accept/.test(document.getElementById("push-result").textContent));
  await page.evaluate(() => { window.__testResult = null; });
  ok("test: success, 'no longer registered' and 'not accepted' each get a clear message");

  // 4. turn off
  await page.click("#push-disable-btn");
  await page.waitForFunction(() => /Off on this device/.test(document.getElementById("push-status").textContent));
  assert.equal(await page.evaluate(() => window.__fake.unsubscribed), 1);
  const last = await page.evaluate(() => window.__calls[window.__calls.length - 1]);
  assert.deepEqual(last, { action: "unsubscribe", endpoint: "https://fcm.googleapis.com/fcm/send/test1" });
  ok("turn off: unsubscribes the browser and tells the server");

  // 5. permission refused / blocked
  await page.evaluate(() => { window.__perm = "default"; window.__nextPerm = "denied"; });
  await settle();
  await page.click("#push-enable-btn");
  await page.waitForFunction(() => /blocked/i.test(document.getElementById("push-status").textContent));
  assert.ok(!(await vis("push-enable-btn")), "no Enable button while blocked");
  assert.match(await text("push-result"), /blocked/i);
  await page.evaluate(() => { window.__perm = "default"; window.__nextPerm = "granted"; });
  ok("blocked permission: explained, no dead button");

  // 6. dismissed prompt
  await page.evaluate(() => { window.__nextPerm = "default"; });
  await settle();
  await page.click("#push-enable-btn");
  await page.waitForFunction(() => /No permission given/.test(document.getElementById("push-result").textContent));
  await page.evaluate(() => { window.__nextPerm = "granted"; });
  ok("dismissing the permission prompt turns nothing on");

  // 7. server function not deployed
  await page.evaluate(() => { window.__pushError = { code: "functions/not-found", message: "NOT_FOUND" }; });
  await page.click("#push-enable-btn");
  await page.waitForFunction(() => /npm run deploy/.test(document.getElementById("push-result").textContent));
  assert.ok(await page.evaluate(() => !document.getElementById("push-enable-btn").disabled), "button usable again");
  await page.evaluate(() => { window.__pushError = null; });
  ok("not deployed: tells you exactly what to run; button recovers");

  // 8. iOS in Safari (not installed) and signed out
  await page.evaluate(() => { Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", configurable: true }); });
  await settle();
  assert.match(await text("push-status"), /Add to Home Screen/);
  assert.ok(!(await vis("push-enable-btn")));
  await page.evaluate(() => { Object.defineProperty(navigator, "userAgent", { get: () => "Mozilla/5.0 (X11; Linux x86_64) Chrome/120", configurable: true }); window.__pokerhqAuthUid = null; });
  await settle();
  assert.match(await text("push-status"), /Sign in/);
  await page.evaluate(() => { window.__pokerhqAuthUid = "u1"; });
  await settle();
  ok("iPhone in Safari → 'Add to Home Screen' instructions; signed out → 'Sign in'");

  // 9. helper: base64url → bytes
  const b = await page.evaluate(() => Array.from(pushKeyToBytes("AQID_-8")));
  assert.deepEqual(b, [1, 2, 3, 255, 239]);
  ok("pushKeyToBytes decodes base64url with -/_ and missing padding");

  // 10. settings switches persist and don't disturb the email settings
  await page.evaluate(() => { window.reminderSettings = { enabled: true, leadDays: 3, email: "bob@example.com" }; renderReminderSettings(); });
  assert.equal(await page.isChecked("#push-start"), true, "defaults on");
  assert.equal(await page.isChecked("#push-morning"), true, "defaults on");
  assert.equal(await page.inputValue("#push-lead"), "60");
  await page.uncheck("#push-start");
  await page.selectOption("#push-lead", "120");
  await page.uncheck("#push-morning");
  const saved = await page.evaluate(() => window.reminderSettings);
  const email = await page.evaluate(() => window.__pokerhqAuthEmail || "bob@example.com");
  assert.deepEqual(saved, { enabled: true, leadDays: 3, email, pushStartAlerts: false, pushMorning: false, pushLeadMinutes: 120, pushHideAmounts: false });
  // the Privacy switch for alerts saves with the rest, and reads back
  await page.check("#push-hide-amounts");
  assert.equal(await page.evaluate(() => window.reminderSettings.pushHideAmounts), true);
  await page.evaluate(() => { renderReminderSettings(); });
  assert.equal(await page.isChecked("#push-hide-amounts"), true);
  await page.uncheck("#push-hide-amounts");
  assert.equal(await page.evaluate(() => window.reminderSettings.pushHideAmounts), false);
  await page.evaluate(() => { renderReminderSettings(); });
  assert.equal(await page.isChecked("#push-start"), false);
  assert.equal(await page.inputValue("#push-lead"), "120");
  // and toggling the email switch keeps the push choices
  await page.uncheck("#reminder-enabled");
  const after = await page.evaluate(() => window.reminderSettings);
  assert.equal(after.enabled, false); assert.equal(after.pushLeadMinutes, 120); assert.equal(after.pushStartAlerts, false);
  ok("push switches save into reminderSettings, survive a re-render, and don't clobber (or get clobbered by) the email settings");

  await (await page.$("#push-settings-card")).screenshot({ path: out("push-desktop.png") });
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.evaluate(() => { window.__perm = "default"; window.__fake.sub = null; return refreshPushUi(); });
  await (await page.$("#push-settings-card")).screenshot({ path: out("push-phone.png") });

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL PHONE-NOTIFICATION UI CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
