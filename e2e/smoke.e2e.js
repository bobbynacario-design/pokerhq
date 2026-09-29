"use strict";
// Real-browser smoke test: boot, the calculator, session results, the bankroll check,
// restore + undo, the study loop and the dashboard.
const assert = require("assert").strict;
const fs = require("fs");
const { boot, out } = require("./lib.js");

const results = [];
const ok = (name) => { results.push(name); console.log("ok  " + name); };

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1280, height: 900 } });

  // 1. boot
  assert.equal(await page.evaluate(() => typeof window.PokerHQMerge + "/" + typeof window.PokerHQPushFold + "/" + typeof window.todayLocal), "object/object/function");
  assert.ok(await page.evaluate(() => document.getElementById("login-overlay").classList.contains("hidden")), "login overlay hidden after sign-in");
  ok("boots; util, merge, pushfold loaded; sign-in gate lifts");

  // 2. local date under Manila time zone: 00:30 PHT must still be "today"
  const d = await page.evaluate(() => { const RealDate = Date; const fake = new RealDate(2026, 8, 29, 0, 30); return todayLocal(fake); });
  assert.equal(d, "2026-09-29");
  ok("todayLocal returns the Manila calendar date at 00:30");

  // 3. push/fold advisor
  await page.evaluate(() => { switchGroup("play", "calculator"); calcSwitchMode("icm"); });
  const fill = async (id, v) => { await page.fill("#" + id, String(v)); };
  await fill("calc-stack", 10000); await fill("calc-bb", 1000); await fill("calc-players", 45); await fill("calc-paid", 9);
  await page.selectOption("#calc-position", "utg");
  let banner = await page.textContent("#adv-rec-banner");
  assert.ok(/SHOVE \d+%/.test(banner) && !/ANY TWO/i.test(banner), "UTG 10bb must not be 'any two': " + banner);
  const utgPct = parseInt(banner.match(/SHOVE (\d+)%/)[1], 10);
  await page.selectOption("#calc-position", "btn");
  banner = await page.textContent("#adv-rec-banner");
  const btnPct = parseInt(banner.match(/SHOVE (\d+)%/)[1], 10);
  assert.ok(btnPct > utgPct * 2, `BTN ${btnPct}% should be far wider than UTG ${utgPct}%`);
  assert.equal(await page.locator("#adv-pf-rows .calc-pushfold-row").count(), 8);
  assert.equal(await page.locator("#adv-pf-rows .calc-pushfold-row.active").count(), 1);
  assert.ok((await page.textContent("#adv-pf-rows .active .pfrow-hands")).includes("22+"), "BTN range shows compressed hands");
  ok(`advisor: UTG ${utgPct}% vs BTN ${btnPct}% at 10bb; 8 position rows, 1 active with hands`);

  await page.selectOption("#calc-ante", "1");
  const withAnte = parseInt((await page.textContent("#adv-rec-banner")).match(/SHOVE (\d+)%/)[1], 10);
  assert.ok(withAnte > btnPct, "antes widen the range");
  assert.equal(await page.evaluate(() => localStorage.getItem("pokerhq_calc_ante")), "1");
  await page.selectOption("#calc-ante", "0");
  await fill("calc-stack", 40000);
  assert.ok((await page.textContent("#adv-rec-banner")).includes("NORMAL PLAY"), "40bb is out of push/fold range");
  ok("antes widen + persist; 40bb falls back to NORMAL PLAY");

  // mobile: ranges must stay visible (legacy .pfrow-desc is display:none <768px)
  await fill("calc-stack", 10000);
  await page.setViewportSize({ width: 390, height: 800 });
  assert.ok(await page.locator("#adv-pf-rows .active .pfrow-hands").isVisible(), "range text visible on a phone");
  await page.setViewportSize({ width: 1280, height: 900 });
  ok("range text stays visible at phone width");

  // 4. session result + bankroll floor round-trip
  await page.evaluate(() => {
    window.bankroll.amount = 0; window.sessions.length = 0; save("bankroll", bankroll);
    document.getElementById("s-name").value = "Blank position cash";
    document.getElementById("s-buyin").value = "3000";
    document.getElementById("s-prize").value = "9000";   // cashed, position left blank
    addSession();
  });
  let s = await page.evaluate(() => ({ result: sessions[0].result, pos: sessions[0].position, br: bankroll.amount, applied: sessions[0].bankrollApplied }));
  assert.equal(s.result, "itm"); assert.equal(s.br, 6000); assert.equal(s.applied, 6000);
  ok("cash with blank position logs as ITM, not Final Table");

  await page.evaluate(() => {
    window.bankroll.amount = 0; save("bankroll", bankroll);
    document.getElementById("s-name").value = "Bust at zero";
    document.getElementById("s-buyin").value = "1000";
    addSession();
  });
  s = await page.evaluate(() => ({ br: bankroll.amount, id: sessions[0].id, applied: sessions[0].bankrollApplied }));
  assert.equal(s.br, 0); assert.equal(s.applied, 0);
  await page.evaluate((id) => deleteSession(id), s.id);
  const afterDelete = await page.evaluate(() => bankroll.amount);
  assert.equal(afterDelete, 0, "deleting a floor-clipped loss must not invent money");
  ok("loss at ₱0 bankroll then delete: bankroll stays ₱0 (was ₱1,000 phantom before)");

  // addSession() opens the session detail a beat later; let it, then clear it away
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll(".modal-overlay.open").forEach((m) => m.classList.remove("open")));

  // 5. bankroll check card
  await page.evaluate(() => { switchGroup("wallet"); });
  await page.evaluate(() => {
    window._demoMode = false;
    window.sessions = [{ id: 1, name: "a", date: "2026-09-01", total: 1000, prize: 3000, pnl: 2000, result: "itm" }];
    window.walletLedger = [{ id: 5, date: "2026-08-30", type: "bankroll_topup", amount: 10000, walletDelta: -10000, bankrollDelta: 10000 }];
    window.bankroll = { amount: 12000, rule: 5 }; window.wallet = { balance: 0 };
    renderTreasury();
  });
  assert.ok((await page.textContent("#bankroll-check")).startsWith("✓"), "consistent history passes the check");
  await page.evaluate(() => { window.bankroll.amount = 15000; renderTreasury(); });
  const warn = await page.textContent("#bankroll-check");
  assert.ok(warn.startsWith("⚠") && warn.includes("₱12,000") && warn.includes("SET TO"), warn);
  await page.click("#bankroll-check button");
  assert.equal(await page.evaluate(() => bankroll.amount), 12000);
  await page.evaluate(() => undoLastDelete());
  assert.equal(await page.evaluate(() => bankroll.amount), 15000, "undo restores the previous value");
  ok("bankroll check: passes when consistent, flags drift, one-click fix is undoable");

  // 6. restore safety net (the RESTORE JSON controls live on the Log Session page)
  await page.evaluate(() => { switchGroup("play", "sessions"); });
  await page.evaluate(() => {
    window.sessions = [{ id: 1, name: "keep me", date: "2026-09-01", total: 1000, prize: 0, pnl: -1000, result: "bust" }, { id: 2, name: "and me", date: "2026-09-02", total: 500, prize: 0, pnl: -500, result: "bust" }];
    window.hands = []; window.tourneys = [];
    save("sessions", sessions);
  });
  const backup = { app: "PokerHQ", format: "backup", version: 1, data: { sessions: [{ id: 99, name: "from backup", date: "2026-01-01", total: 100, prize: 0, pnl: -100, result: "bust" }], hands: [], tourneys: [], strategies: [], news: [], spotlights: [], satellites: [], opponents: [], bankroll: { amount: 500, rule: 5 }, satTarget: { name: "", buyin: 0 } } };
  fs.writeFileSync(out("backup.json"), JSON.stringify(backup));
  await page.setInputFiles("#backup-restore-input", out("backup.json"));
  await page.waitForFunction(() => sessions.length === 1 && sessions[0].id === 99);
  assert.ok(await page.locator("#undo-toast.show").count(), "undo toast shown");
  assert.ok(await page.isVisible("#restore-undo-btn"), "persistent undo button appears");
  await page.evaluate(() => undoLastDelete());               // toast undo
  await page.waitForFunction(() => sessions.length === 2);
  assert.deepEqual(await page.evaluate(() => sessions.map((x) => x.name)), ["keep me", "and me"]);
  ok("restore keeps a snapshot; toast undo puts the previous data back");

  await page.setInputFiles("#backup-restore-input", out("backup.json"));
  await page.waitForFunction(() => sessions.length === 1 && sessions[0].id === 99);
  await page.evaluate(() => { document.getElementById("undo-toast").classList.remove("show"); hideUndoToast(); });
  await page.click("#restore-undo-btn");                     // after the toast is gone
  await page.waitForFunction(() => sessions.length === 2);
  assert.equal(await page.isVisible("#restore-undo-btn"), false, "button hides once used");
  ok("UNDO LAST RESTORE button works after the toast has expired");

  // 7. study loop tile + strategy page still render
  await page.evaluate(() => { window.sessions = sessions; renderStudyLoop(); renderStrategy(); switchGroup("improve", "strategy"); });
  const loop = await page.innerHTML("#study-loop-wrap");
  assert.ok(loop.includes("News") && (loop.includes("ai-research-btn") || loop.includes("times")), "study loop tile retargeted");
  assert.ok(await page.isVisible("#ai-research-btn"), "the button the tile points at exists");
  ok("study-loop tile points at the AI research button, which exists");

  // 8. dashboard renders under the merged sync path
  await page.evaluate(() => switchGroup("home"));
  await page.waitForTimeout(150);
  ok("dashboard renders");

  // any errors, ignoring expected network noise from blocked CDNs
  const real = realErrors();
  assert.deepEqual(real, [], "no page errors: " + real.join(" | "));
  ok("no page errors or console errors");

  await close();
  console.log("\nALL " + results.length + " BROWSER CHECKS PASSED");
})().catch(async (e) => { console.error("\nFAIL:", e.stack || e); process.exit(1); });
