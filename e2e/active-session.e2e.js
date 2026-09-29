"use strict";
// A whole live session, the way it is used at the table: start it, run the timer,
// check in, count a re-entry, capture a hand and a villain while playing, then log
// the result and confirm the hand ends up attached to the finished session.
const assert = require("assert").strict;
const { boot } = require("./lib.js");

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  const closeModals = () => page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));
  await page.evaluate(() => { window.bankroll.amount = 50000; window.sessions.length = 0; window.hands.length = 0; window.opponents.length = 0; save("bankroll", bankroll); switchGroup("play", "sessions"); });

  // 1. fill in what is known up front, then start the session (skipping the readiness check)
  await page.fill("#s-name", "E2E Sunday Main");
  await page.fill("#s-venue", "Okada Manila");
  await page.fill("#s-buyin", "3000");
  await page.evaluate(() => switchGroup("home"));          // the timer lives on Home
  await page.click("#timer-start-btn");
  await page.waitForSelector("#modal-readiness.open");
  await page.getByRole("button", { name: "SKIP", exact: true }).click();
  await page.waitForSelector("#timer-stop-btn", { state: "visible" });
  assert.equal(await page.isVisible("#timer-start-btn"), false);
  await page.evaluate(() => switchGroup("play", "sessions"));
  const card = page.locator("#play-active-session-wrap .active-session-card");
  await card.waitFor();
  assert.match(await card.textContent(), /E2E Sunday Main/);
  assert.match(await card.textContent(), /Okada Manila/);
  assert.match(await card.textContent(), /Timer running/);
  ok("starting the session shows the running timer and an active-session card with the venue and name");

  // 2. the clock really counts
  const t0 = await page.textContent("#timer-display");
  await page.waitForTimeout(2200);
  const t1 = await page.textContent("#timer-display");
  assert.notEqual(t0, t1, "the timer moved: " + t0 + " → " + t1);
  ok("the clock advances (" + t0 + " → " + t1 + ")");

  // 3. quick check-in fills in the mental scores on the form
  await page.click("#play-active-session-wrap .quick-checkin >> text=SHARP");
  assert.equal(await page.inputValue("#s-focus"), "9");
  assert.equal(await page.inputValue("#s-energy"), "8");
  ok("SHARP check-in fills focus 9 / energy 8 on the session form");

  // 4. a re-entry raises the bullet count and survives a re-render
  await page.click("#play-active-session-wrap .counter-btn >> text=+");
  await page.click("#play-active-session-wrap .counter-btn >> text=+");
  assert.equal(await page.evaluate(() => _activeSessionDraft.bullets), 3);
  await page.evaluate(() => renderActiveSessionSurface());
  assert.equal((await page.textContent("#play-active-session-wrap .counter-value")).trim(), "3");
  await page.click("#play-active-session-wrap .counter-btn >> text=−");
  assert.equal(await page.evaluate(() => _activeSessionDraft.bullets), 2);
  ok("bullets: + + − = 2, and the card keeps the number after redrawing");

  // 5. capture a hand while playing: it is held against the running session
  await page.click("#play-active-session-wrap >> text=CAPTURE HAND");
  await page.waitForSelector("#modal-hand.open");
  const key = await page.inputValue("#h-pending-session-key");
  assert.ok(key, "the hand form carries the running session's key");
  await page.fill("#h-title", "KK vs shove");
  await page.fill("#h-desc", "Called off 22bb, lost to AK.");
  await page.locator("#modal-hand").getByRole("button", { name: /^SAVE HAND/ }).click();
  await page.waitForFunction(() => hands.length === 1);
  let h = await page.evaluate(() => ({ title: hands[0].title, sessionId: hands[0].sessionId, key: hands[0].pendingSessionKey }));
  assert.deepEqual(h, { title: "KK vs shove", sessionId: 0, key });
  ok("CAPTURE HAND saves a hand that waits on the running session");

  // 6. capture a villain note while playing
  await page.click("#play-active-session-wrap >> text=CAPTURE VILLAIN NOTE");
  await page.waitForSelector("#modal-opponent.open");
  assert.equal(await page.inputValue("#opp-venue"), "Okada Manila", "the villain form starts with the session venue");
  await page.fill("#opp-name", "Seat 4 limper");
  await page.locator("#modal-opponent").getByRole("button", { name: /^SAVE/ }).click();
  await page.waitForFunction(() => opponents.length === 1);
  assert.match(await page.evaluate(() => opponents[0].notes), /E2E Sunday Main/);
  ok("CAPTURE VILLAIN NOTE saves a villain tagged with the session and its venue");

  // 7. stop the timer (back on Home) and log it to the form
  await page.evaluate(() => switchGroup("home"));
  await page.click("#timer-stop-btn");
  await page.waitForSelector("#timer-log-btn", { state: "visible" });
  await page.waitForFunction(() => document.querySelector("#timer-start-btn").textContent.trim() === "RESUME");
  ok("STOP pauses the clock and offers RESUME / LOG TIMER");
  await page.click("#timer-log-btn");
  assert.ok(parseFloat(await page.inputValue("#s-hours")) >= 0, "hours filled from the timer");
  ok("LOG TIMER TO SESSION puts the played hours on the form");

  // 8. finish: result in, the session is saved, bankroll moves, the hand is attached
  await page.fill("#s-position", "12");
  await page.fill("#s-prize", "9000");
  await page.click("#session-submit-btn");
  await page.waitForFunction(() => sessions.length === 1);
  await page.waitForTimeout(300);
  await closeModals();
  const done = await page.evaluate(() => ({
    name: sessions[0].name, pnl: sessions[0].pnl, result: sessions[0].result, bullets: sessions[0].bullets, focus: sessions[0].focus,
    bankroll: bankroll.amount, handSession: hands[0].sessionId === sessions[0].id, handKey: hands[0].pendingSessionKey || "",
    draft: typeof _activeSessionDraft === "undefined" ? null : _activeSessionDraft,
  }));
  assert.equal(done.name, "E2E Sunday Main");
  assert.equal(done.result, "itm");
  assert.equal(done.pnl, 6000, "P&L is the ₱9,000 prize minus the ₱3,000 buy-in");
  assert.equal(done.bullets, 2);
  assert.equal(done.focus, 9);
  assert.equal(done.bankroll, 56000);
  assert.equal(done.handSession, true, "the captured hand is now attached to the finished session");
  assert.equal(done.handKey, "", "and no longer waits on a pending key");
  assert.equal(done.draft, null, "the active session is over");
  ok("LOG SESSION: ITM +₱6,000, bankroll ₱56,000, hand attached to the session, active session cleared");

  // 9. the active-session card is gone and PLAY offers a fresh start
  await page.evaluate(() => switchGroup("play", "sessions"));
  assert.equal(await page.locator("#play-active-session-wrap .active-session-card").count(), 0);
  assert.match(await page.textContent("#play-empty-wrap"), /No active session yet/);
  ok("after logging, the active-session card goes and 'No active session yet' returns");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
