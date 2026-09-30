"use strict";
// The Review Inbox: everything waiting for a second look, from five sources, with Review and
// Mark resolved on each. Seeds one of each, then walks the page, the Home card, the badges, every
// Review action, every Mark resolved (and its undo), and follows live changes.
const assert = require("assert").strict;
const { boot, freezeMotion, OWNER } = require("./lib.js");

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));
  const settle = (ms = 120) => page.waitForTimeout(ms);
  const rows = () => page.$$eval("#inbox-list .inbox-row", (r) => r.map((x) => ({ key: x.getAttribute("data-key"), title: x.querySelector(".inbox-title").textContent.replace(/\s+/g, " ").trim(), detail: x.querySelector(".inbox-detail").textContent.trim() })));
  const badge = () => page.$$eval(".inbox-badge", (bs) => bs.filter((b) => b.offsetParent !== null).map((b) => b.textContent));
  const day = (n) => { const d = new Date(Date.now() - n * 86400000); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const openInbox = async () => { await page.evaluate(() => switchGroup("review", "inbox")); await settle(); };

  // 0. empty: no card on Home, a friendly page, no badge
  await page.evaluate(() => { window.sessions.length = 0; window.hands.length = 0; window.opponents.length = 0; localStorage.removeItem("pokerhq_drill_v1"); refreshInboxNow(); switchGroup("home"); });
  await settle();
  assert.equal(await page.locator("#inbox-home-wrap .inbox-card").count(), 0);
  await openInbox();
  assert.match(await page.textContent("#inbox-list"), /Inbox clear/);
  assert.deepEqual(await badge(), []);
  ok("empty: no card on Home, the page says 'Inbox clear', no badge");

  // 1. seed one of each source
  await page.evaluate((d) => {
    const now = Date.now(), DAY = 86400000;
    window.sessions = [
      { id: now - 2 * DAY, name: "Sunday Main", date: d[2], venue: "Okada Manila", total: 3000, prize: 0, pnl: -3000, result: "bust" },
      { id: now - 40 * DAY, name: "Old session", date: d[40], venue: "Okada Manila", total: 3000, prize: 0, pnl: -3000, result: "bust" },
    ];
    window.hands = [
      { id: now - 1 * DAY, sessionId: 0, session: "s", title: "Big pot", desc: "", lesson: "", result: "", tags: ["bigpot"], needsDetails: true, marker: { kind: "bigpot", at: now - DAY, elapsedMs: 600000, stack: "24bb" } },
      { id: now - 5 * DAY, sessionId: 0, session: "s", title: "KK vs the nit", desc: "d", lesson: "Fold KK to a 4-bet from a nit", result: "lost", tags: ["later"] },
      { id: now - 9 * DAY, sessionId: 0, session: "s", title: "AK on the bubble", desc: "d", lesson: "Shove wider on the bubble", result: "won", tags: [] },
    ];
    window.opponents = [
      { id: now - 100 * DAY, name: "The Limper", venue: "Okada Manila", tags: [], notes: "Open limps a lot", added: d[100] },
      { id: now - 100 * DAY + 1, name: "Other room guy", venue: "Somewhere I never play", tags: [], notes: "x", added: d[100] },
    ];
    localStorage.setItem("pokerhq_drill_v1", JSON.stringify({ saved: ["pre-pushfold"] }));
    syncGlobalAliases(); refreshInboxNow();
  }, [0, 1, day(2)].concat(new Array(38).fill(0)).map((_, i) => day(i)));
  await settle();
  const all = await rows().catch(() => []);
  await openInbox();
  const list = await rows();
  assert.deepEqual(list.map((r) => r.key.split(":")[0]), ["session", "session", "hand", "hand", "lesson", "opponent", "drill"], JSON.stringify(list.map((r) => r.key)));
  assert.match(list.find((r) => r.title.includes("Old session")).detail, /^Overdue debrief · played 40 days ago$/, "old debriefs stay visible instead of silently disappearing");
  assert.equal(list.filter((r) => r.title.includes("Other room")).length, 0, "villains at rooms you don't play are left alone");
  const groups = await page.$$eval("#inbox-list .inbox-group-title", (g) => g.map((x) => x.textContent.replace(/\s+/g, " ").trim()));
  assert.deepEqual(groups, ["📝 Sessions to debrief 2", "🃏 Hands to review 2", "💡 Lessons due 1", "👤 Villain notes to refresh 1", "🎯 Saved drills 1"]);
  assert.match(list[1].detail, /^No debrief yet · played 2 days ago$/);
  assert.equal(list[2].title.replace(/^\S+\s/, ""), "KK vs the nit");    // older hand first
  assert.match(list.find((r) => r.title.includes("Big pot")).detail, /^Needs details · yesterday$/);
  assert.match(list.find((r) => r.key.startsWith("opponent")).detail, /^Notes last touched 100 days ago · Okada Manila$/);
  assert.match(list.find((r) => r.key.startsWith("drill")).title, /Push\/fold spot check/);
  ok("seven items in five groups: overdue debriefs stay, unresolved hands are not duplicated as lessons, and other rooms stay out");

  // 2. the badges and the Home card
  assert.deepEqual(await badge(), ["7", "7"], "the REVIEW tab and the Inbox sub-tab (the phone copies are hidden on a desktop)");
  await page.evaluate(() => switchGroup("home"));
  await settle();
  assert.equal(await page.locator("#inbox-home-wrap .inbox-row").count(), 3, "the card shows the top three");
  assert.match(await page.textContent("#inbox-home-wrap .inbox-card-top"), /Review Inbox\s*7/);
  assert.match(await page.textContent("#inbox-home-wrap .inbox-card-top button"), /OPEN INBOX · 4 more/);
  assert.match(await page.textContent("#inbox-home-wrap .inbox-row"), /Old session/, "the oldest overdue debrief is first");
  await page.click("#inbox-home-wrap .inbox-card-top button");
  assert.equal(await page.evaluate(() => document.getElementById("page-inbox").classList.contains("active")), true);
  ok("badges show 7; Home shows the top 3 with 'OPEN INBOX · 4 more', which opens the page");

  // 3. Review opens the right thing for each kind
  const review = async (keyPrefix, nth) => page.locator('#inbox-list .inbox-row[data-key^="' + keyPrefix + '"]').nth(nth || 0).getByRole("button", { name: /^(REVIEW|FINISH|OPEN)/ }).click();
  await review("session", 1);
  await page.waitForSelector("#modal-session-detail.open");
  assert.match(await page.textContent("#sd-title"), /Sunday Main/);
  await closeModals();
  await review("hand", 1);      // the marker: finish it
  await page.waitForSelector("#modal-hand.open");
  assert.equal(await page.inputValue("#h-title"), "Big pot");
  assert.match(await page.textContent("#h-marker-note"), /Add what happened/);
  await closeModals();
  await review("hand", 0);      // review later: the replay
  await page.waitForSelector("#modal-hand-replay.open");
  assert.match(await page.textContent("#hr-title"), /KK vs the nit/);
  await closeModals();
  await review("lesson");
  await page.waitForSelector("#modal-hand-replay.open");
  await closeModals();
  await review("opponent");
  await page.waitForSelector("#modal-opponent.open");
  assert.equal(await page.inputValue("#opp-name"), "The Limper");
  await closeModals();
  await review("drill");
  assert.equal(await page.evaluate(() => document.getElementById("page-dashboard").classList.contains("active")), true, "Home");
  assert.match(await page.textContent("#tg-drill"), /From your saved drills/);
  ok("Review opens the session, the FINISH form, the replay, the lesson's hand, the villain, and the saved drill");

  // 4. Mark resolved: the flag is written and saved, the item leaves, the badge drops, UNDO puts it back
  await openInbox();
  const resolve = (keyPrefix, nth) => page.locator('#inbox-list .inbox-row[data-key^="' + keyPrefix + '"]').nth(nth || 0).getByRole("button", { name: "MARK RESOLVED" }).click();
  await resolve("session", 1);
  assert.ok(await page.evaluate(() => typeof sessions[0].debriefedAt === "number"), "debriefedAt is set");
  assert.equal((await rows()).length, 6);
  assert.deepEqual(await badge(), ["6", "6"]);
  assert.match(await page.textContent("#undo-toast-label"), /^Resolved: Sunday Main/);
  const cloudFlag = await page.evaluate(() => { for (const [p, v] of globalThis.__cloud.docs) if (p.endsWith("/sessions")) return JSON.parse(v.value).some((s) => typeof s.debriefedAt === "number"); return null; });
  assert.equal(cloudFlag, true, "the flag reached the cloud copy");
  await page.click("#undo-toast [onclick*='undoLastDelete'], #undo-toast button");
  await settle();
  assert.equal(await page.evaluate(() => "debriefedAt" in sessions[0]), false, "undo removes the flag");
  assert.equal((await rows()).length, 7);
  ok("resolve a session: flag saved to the cloud, item and badge drop; UNDO brings it back exactly");

  await resolve("hand", 0);                      // KK vs the nit (review later)
  assert.ok(await page.evaluate(() => hands.find((h) => h.title === "KK vs the nit").resolvedAt > 0));
  const afterHand = await rows();
  assert.equal(afterHand.filter((r) => r.key.startsWith("hand:")).length, 1, "the review-later hand is gone (the marker remains)");
  assert.equal(afterHand.filter((r) => r.key.startsWith("lesson:")).length, 2, "its lesson is a separate item and stays");
  await resolve("lesson", 0);                    // got it: the lesson goes away for now
  assert.equal(await page.evaluate(() => hands.filter((h) => h.lessonStep === 1).length), 1);
  await resolve("opponent");
  assert.ok(await page.evaluate(() => opponents[0].reviewedAt > 0));
  await resolve("drill");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("pokerhq_drill_v1")).saved), []);
  const after = await rows();
  assert.deepEqual(after.map((r) => r.key.split(":")[0]).sort(), ["hand", "lesson", "session", "session"].sort(), JSON.stringify(after.map((r) => r.key)));
  ok("resolving a review-later hand, a lesson ('got it'), a villain note and a saved drill each clears just that item");

  // undo for the drill too
  await page.evaluate(async () => { window.drillState = PokerHQDrills.normalizeState({ saved: ["pre-pushfold"] }); localStorage.setItem("pokerhq_drill_v1", JSON.stringify(window.drillState)); await window.fbSave('drillState',window.drillState); refreshInboxNow(); });
  await settle();
  await resolve("drill");
  await page.click("#undo-toast button");
  await settle();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("pokerhq_drill_v1")).saved), ["pre-pushfold"]);
  ok("UNDO on a resolved drill saves it again");

  // 5. the flags survive a reload (local copy and cloud copy)
  const cloud = await page.evaluate(() => [...globalThis.__cloud.docs.entries()]);
  await page.addInitScript((e) => { globalThis.__cloud = { docs: new Map(e), listeners: new Map(), stats: { transactions: 0, txWrites: 0, sets: 0, gets: 0 }, failNext: null }; }, cloud);
  await page.reload();
  await page.waitForFunction(() => typeof window.__authCallback === "function");
  await page.evaluate((u) => window.__authCallback(u), OWNER);
  await settle(700);
  await page.evaluate(() => { const o = document.getElementById("onboarding-overlay"); if (o) o.style.display = "none"; });
  await openInbox();
  const reloaded = await rows();
  assert.deepEqual(reloaded.map((r) => r.key.split(":")[0]).sort(), ["drill", "hand", "lesson", "session", "session"].sort(), "resolved items stay resolved after a reload; the un-done drill is back");
  ok("after a reload the resolved items are still resolved");

  // 6. mark the debrief done from the session itself
  await page.evaluate(() => viewSessionDetail(sessions[0].id));
  assert.match(await page.textContent("#sd-debriefed-btn"), /MARK DEBRIEF DONE/);
  const before = (await rows()).length;
  await page.click("#sd-debriefed-btn");
  assert.match(await page.textContent("#sd-debriefed-btn"), /✓ DEBRIEF DONE · UNDO/);
  assert.equal(await page.evaluate(() => typeof sessions[0].debriefedAt), "number");
  await closeModals(); await openInbox();
  assert.equal((await rows()).length, before - 1);
  await page.evaluate(() => viewSessionDetail(sessions[0].id));
  await page.click("#sd-debriefed-btn");
  assert.equal(await page.evaluate(() => "debriefedAt" in sessions[0]), false, "the button toggles it back");
  await closeModals();
  ok("the session detail's MARK DEBRIEF DONE sets the same flag (and toggles back)");

  // 7. finishing a marker, or editing a stale villain, clears their items with no button in the inbox
  await openInbox();
  await page.locator('#inbox-list .inbox-row[data-key^="hand"]').filter({ hasText: "Big pot" }).getByRole("button", { name: /FINISH/ }).click();
  await page.waitForSelector("#modal-hand.open");
  await page.fill("#h-desc", "Called a shove with a flush draw.");
  await page.locator("#modal-hand").getByRole("button", { name: /^SAVE HAND/ }).click();
  await settle(300);
  await openInbox();
  assert.equal((await rows()).filter((r) => r.title.includes("Big pot")).length, 0, "finishing the details cleared it");
  await page.locator('#inbox-list .inbox-row[data-key^="opponent"]').count();
  await page.evaluate(() => { opponents[0].reviewedAt = 0; delete opponents[0].reviewedAt; refreshInboxNow(); });
  await settle();
  await review("opponent");
  await page.waitForSelector("#modal-opponent.open");
  await page.fill("#opp-notes", "Open limps a lot. Now folds to 3-bets.");
  await page.locator("#modal-opponent").getByRole("button", { name: /^SAVE/ }).click();
  await settle(300);
  assert.equal(typeof (await page.evaluate(() => opponents[0].updatedAt)), "number");
  await openInbox();
  assert.equal((await rows()).filter((r) => r.key.startsWith("opponent")).length, 0, "updating the villain's notes counts as reviewing them");
  ok("finishing a marker or updating a villain's notes clears the item by itself");

  // 8. it follows live changes: a Review later tap during a session lands in the inbox at once
  await page.evaluate(() => { window.hands.length = 0; window.sessions.length = 0; window.drillState = PokerHQDrills.normalizeState({}); localStorage.removeItem("pokerhq_drill_v1"); refreshInboxNow(); switchGroup("play", "sessions"); document.getElementById("s-name").value = "Live one"; switchGroup("home"); });
  await page.click("#timer-start-btn");
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await page.evaluate(() => switchGroup("play", "sessions"));
  assert.deepEqual(await badge(), []);
  await page.click('#play-active-session-wrap .lm-btn[data-kind="later"]');
  await settle(200);
  assert.deepEqual(await badge(), ["1"], "the REVIEW tab counted the marker without leaving the Play page");
  await page.click('#play-active-session-wrap .lm-btn[data-kind="tilt"]');
  await settle(200);
  assert.deepEqual(await badge(), ["2"]);
  ok("markers tapped mid-session show up in the badge straight away");

  // 9. phone: badge on the bottom REVIEW tab, rows stack, nothing sideways
  await page.setViewportSize({ width: 390, height: 844 });
  await openInbox();
  const phone = await page.evaluate(() => {
    const mobBadge = document.querySelector("#mob-review .inbox-badge");
    const r = mobBadge.getBoundingClientRect();
    return { badgeShown: getComputedStyle(mobBadge).display !== "none", badgeInView: r.right <= innerWidth && r.left >= 0 && r.top >= 0, overflow: document.documentElement.scrollWidth - innerWidth, rows: [...document.querySelectorAll("#inbox-list .inbox-row")].map((x) => Math.round(x.getBoundingClientRect().right)) };
  });
  assert.ok(phone.badgeShown && phone.badgeInView, "the bottom tab has its badge: " + JSON.stringify(phone));
  assert.ok(phone.overflow <= 0 && phone.rows.every((r) => r <= 390), "no sideways scroll on a phone");
  ok("phone: the REVIEW tab carries the badge, rows fit, no sideways scroll");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
