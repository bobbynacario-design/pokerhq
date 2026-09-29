const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot();
  const ok = (m) => console.log("ok  " + m);

  // dialog semantics on every modal
  const sem = await page.evaluate(() => [...document.querySelectorAll(".modal-overlay")].map((o) => ({ id: o.id, role: o.getAttribute("role"), modal: o.getAttribute("aria-modal"), labelled: !!(o.getAttribute("aria-labelledby") && document.getElementById(o.getAttribute("aria-labelledby")) && document.getElementById(o.getAttribute("aria-labelledby")).textContent.trim()) })));
  assert.ok(sem.length >= 8, "found the modals");
  const bad = sem.filter((m) => m.role !== "dialog" || m.modal !== "true");
  assert.deepEqual(bad, [], "every modal has role=dialog + aria-modal");
  const unlabelled = sem.filter((m) => !m.labelled).map((m) => m.id);
  console.log("    (modals without a .modal-title label: " + JSON.stringify(unlabelled) + ")");
  ok(sem.length + " modals expose role=dialog and aria-modal");

  // open → focus inside; Esc closes; focus returns to the opener
  await page.evaluate(() => { switchGroup("plan", "calendar"); });
  const opener = await page.evaluateHandle(() => { const b = document.querySelector("#page-calendar button"); b.id = "test-opener"; return b; });
  await page.evaluate(() => { document.getElementById("test-opener").focus(); openNewTourneyModal(); });
  assert.ok(await page.evaluate(() => document.getElementById("modal-tourney").classList.contains("open")));
  assert.ok(await page.evaluate(() => document.getElementById("modal-tourney").contains(document.activeElement)), "focus moved into the dialog");
  await page.keyboard.press("Escape");
  assert.ok(!(await page.evaluate(() => document.getElementById("modal-tourney").classList.contains("open"))), "Esc closes");
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.id), "test-opener", "focus returned to opener");
  ok("Esc closes the modal and focus returns to what opened it");

  // Tab trap
  await page.evaluate(() => openNewTourneyModal());
  await page.evaluate(() => { const f = [...document.querySelectorAll("#modal-tourney button, #modal-tourney input, #modal-tourney select, #modal-tourney textarea")].filter((n) => n.offsetParent !== null); f[f.length - 1].focus(); });
  await page.keyboard.press("Tab");
  const wrapped = await page.evaluate(() => { const m = document.getElementById("modal-tourney"); const f = [...m.querySelectorAll("button, input, select, textarea")].filter((n) => n.offsetParent !== null); return m.contains(document.activeElement) && document.activeElement === f[0]; });
  assert.ok(wrapped, "Tab from the last control wraps to the first");
  await page.keyboard.press("Shift+Tab");
  const back = await page.evaluate(() => { const m = document.getElementById("modal-tourney"); const f = [...m.querySelectorAll("button, input, select, textarea")].filter((n) => n.offsetParent !== null); return document.activeElement === f[f.length - 1]; });
  assert.ok(back, "Shift+Tab from the first wraps to the last");
  await page.keyboard.press("Escape");
  ok("Tab / Shift+Tab stay inside the dialog");

  // backdrop tap still dismisses
  await page.evaluate(() => openNewTourneyModal());
  await page.mouse.click(5, 5);
  assert.ok(!(await page.evaluate(() => document.getElementById("modal-tourney").classList.contains("open"))));
  ok("tapping the backdrop still closes it");

  // voice modal: dismissal must run the cleanup that stops the microphone
  await page.evaluate(() => { window.__voiceCleanups = 0; const real = window.clearVoiceModal; window.clearVoiceModal = function () { window.__voiceCleanups++; return real.apply(this, arguments); }; openModal("modal-voice"); });
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.__voiceCleanups), 1, "Esc ran the voice cleanup");
  await page.evaluate(() => openModal("modal-voice"));
  await page.mouse.click(5, 5);
  assert.equal(await page.evaluate(() => window.__voiceCleanups), 2, "backdrop tap ran the voice cleanup");
  ok("dismissing the voice modal stops any recording (Esc and backdrop)");

  // stacked modals: Esc closes only the top one
  await page.evaluate(() => { openModal("modal-hand"); openModal("modal-tourney"); });
  await page.keyboard.press("Escape");
  assert.deepEqual(await page.evaluate(() => ["modal-hand", "modal-tourney"].map((id) => document.getElementById(id).classList.contains("open"))), [true, false]);
  await page.keyboard.press("Escape");
  assert.ok(!(await page.evaluate(() => document.getElementById("modal-hand").classList.contains("open"))));
  ok("stacked modals close top-first");

  // Today Glance: the running clock ticks without rebuilding the card
  await page.evaluate(() => { switchGroup("home"); startTimer(); skipReadinessCheck(); });
  await page.waitForFunction(() => document.getElementById("tg-elapsed"));
  await page.waitForTimeout(1200);   // let the page's own start-up renders finish (slow CI machines render late)
  await page.evaluate(() => { window.__card = document.querySelector("#today-glance-wrap .tg-card"); window.__t0 = document.getElementById("tg-elapsed").textContent; });
  await page.waitForTimeout(2300);
  const tick = await page.evaluate(() => ({ same: window.__card === document.querySelector("#today-glance-wrap .tg-card") && document.body.contains(window.__card), t0: window.__t0, t1: document.getElementById("tg-elapsed").textContent }));
  assert.ok(tick.same, "the card element survived 2+ ticks (was rebuilt every second)");
  assert.notEqual(tick.t0, tick.t1, "clock advanced: " + tick.t0 + " → " + tick.t1);
  await page.evaluate(() => stopTimer());
  ok("Today Glance clock advances (" + tick.t0 + " → " + tick.t1 + ") without rebuilding the card");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL MODAL/TIMER CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
