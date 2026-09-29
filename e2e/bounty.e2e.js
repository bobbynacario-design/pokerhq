const assert = require("assert").strict;
const fs = require("fs");
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1200, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  await page.evaluate(() => { window.bankroll.amount = 10000; window.sessions.length = 0; save("bankroll", bankroll); switchGroup("play", "sessions"); });
  assert.ok(await page.isVisible("#s-bounty"), "bounty field is on the form");

  // PKO: bust with only bounties
  await page.evaluate(() => {
    document.getElementById("s-name").value = "PKO bounty only";
    document.getElementById("s-venue").value = "Metro";
    document.getElementById("s-buyin").value = "3000";
    document.getElementById("s-prize").value = "0";
    document.getElementById("s-bounty").value = "1500";
    addSession();
  });
  let s = await page.evaluate(() => ({ r: sessions[0].result, pnl: sessions[0].pnl, b: sessions[0].bounties, br: bankroll.amount }));
  assert.deepEqual(s, { r: "bust", pnl: -1500, b: 1500, br: 8500 });
  ok("bounty-only session: still a bust, P&L −₱1,500 (not −₱3,000), bankroll 10,000 → 8,500");

  // a cash with prize + bounties
  await page.evaluate(() => {
    switchGroup("play", "sessions");
    document.getElementById("s-name").value = "PKO cash";
    document.getElementById("s-buyin").value = "3000";
    document.getElementById("s-position").value = "5";
    document.getElementById("s-prize").value = "6000";
    document.getElementById("s-bounty").value = "1000";
    addSession();
  });
  s = await page.evaluate(() => ({ r: sessions[0].result, pnl: sessions[0].pnl, br: bankroll.amount }));
  assert.deepEqual(s, { r: "itm", pnl: 4000, br: 12500 });
  ok("prize 6,000 + bounties 1,000 on a 3,000 buy-in → +₱4,000, ITM");

  // dashboard totals include bounties
  await page.evaluate(() => { switchGroup("home"); refreshDashboard(); });
  assert.equal((await page.textContent("#dash-pnl")).replace(/\s/g, ""), "₱2,500");
  assert.match(await page.textContent("#dash-biggest"), /7,000/);
  const rows = await page.$$eval("#dash-session-tbody tr", (trs) => trs.map((t) => t.children[4].textContent));
  assert.ok(rows.some((c) => /₱6,000.*\+₱1,000 bty/.test(c)), "cell shows prize and bounties: " + rows.join(" | "));
  assert.ok(rows.some((c) => /^₱1,500 bty$/.test(c.trim())), "bounty-only cell");
  ok("dashboard: P&L ₱2,500, biggest cash includes bounties, cells show '+₱1,000 bty'");

  // history table + editing
  await page.evaluate(() => { switchGroup("review", "sessions"); renderSessionTable(); });
  const editId = await page.evaluate(() => sessions.find((x) => x.name === "PKO cash").id);
  await page.evaluate((id) => { switchGroup("play", "sessions"); editSession(id); }, editId);
  assert.equal(await page.inputValue("#s-bounty"), "1000");
  await page.fill("#s-bounty", "2500");
  await page.evaluate(() => addSession());
  s = await page.evaluate(() => { const x = sessions.find((y) => y.name === "PKO cash"); return { b: x.bounties, pnl: x.pnl, br: bankroll.amount }; });
  assert.deepEqual(s, { b: 2500, pnl: 5500, br: 14000 });
  ok("editing repopulates the bounty and re-applies P&L and bankroll (12,500 → 14,000)");

  // delete reverses exactly
  await page.evaluate((id) => deleteSession(id), editId);
  assert.equal(await page.evaluate(() => bankroll.amount), 8500);
  ok("deleting reverses the bounty-inclusive P&L");

  // CSV export has a Bounties column with the value
  const csv = await page.evaluate(() => {
    let captured = ""; const OrigBlob = window.Blob;
    window.Blob = function (parts) { captured = parts.join(""); return new OrigBlob(parts); };
    exportCSV(); window.Blob = OrigBlob; return captured;
  });
  const [head, first] = csv.split("\n");
  assert.ok(head.includes("Prize,Bounties,P&L"), head);
  assert.ok(first.includes(",0,1500,-1500,"), first);
  ok("CSV export has a Bounties column: " + first.slice(0, 60));

  // staking counts bounties as winnings
  const st = await page.evaluate(() => {
    const sess = { id: 5, name: "Backed PKO", total: 1000, buyin: 1000, rebuy: 0, prize: 0, bounties: 800, pnl: -200, packageName: "Pkg", playerSharePct: 50, markup: 1, backerCount: 1 };
    const d = getSessionStakingData(sess);
    return d ? { playerNet: d.playerNet, backerNet: d.backerNet } : null;
  });
  console.log("    staking with ₱800 bounties on ₱1,000 buy-in, 50/50:", JSON.stringify(st));
  assert.ok(st && st.backerNet !== -500, "backer result reflects the ₱800 return, not a total loss");
  ok("staking treats bounties as winnings");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL BOUNTY CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
