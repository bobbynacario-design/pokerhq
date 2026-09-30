const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1100, height: 900 } });
  const ok = (m) => console.log("ok  " + m);
  await page.evaluate(() => { window.sessions.length = 0; switchGroup("home"); refreshDashboard(); });
  assert.match(await page.textContent("#month-breakdown"), /month-by-month/);
  ok("empty: friendly placeholder");

  await page.evaluate(() => { loadDemoMode(); });
  await page.waitForTimeout(150);
  const rows = await page.$$eval("#month-breakdown tbody tr", (trs) => trs.map((t) => [t.children[0].textContent.replace(" *", ""), t.children[1].textContent]));
  console.log("    " + rows.map((r) => r.join(":")).join("  "));
  assert.ok(rows.length >= 4 && rows.length <= 12);
  assert.equal(rows[0][0], "Mar 2026", "newest month first (demo data ends March 2026)");
  assert.equal(rows.reduce((n, r) => n + parseInt(r[1], 10), 0), 20, "12-month table covers all 20 demo sessions");
  ok("demo data: " + rows.length + " months, newest first, sessions add up to 20");

  // export: demo blocked, real data works
  await page.evaluate(() => { window.__alerts = []; window.alert = (m) => window.__alerts.push(m); exportMonthlyCSV(); });
  assert.match(await page.evaluate(() => window.__alerts[0]), /Clear demo mode/);
  await page.evaluate(() => { window._demoMode = false; window.sessions = [
    { id: 1, name: "a", date: "2026-01-04", total: 1000, prize: 3000, bounties: 0, pnl: 2000, hours: 4, result: "itm", venue: "Metro", position: 5, field: 50 },
    { id: 2, name: "b", date: "2026-02-01", total: 2000, prize: 0, bounties: 500, pnl: -1500, hours: 6, result: "bust", venue: "Okada", position: 20, field: 50 },
  ]; syncGlobalAliases(); refreshDashboard(); });
  const csv = await page.evaluate(() => { let cap = "", name = ""; const O = window.Blob; window.Blob = function (p) { cap = p.join(""); return new O(p); }; const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { name = this.download; }; exportMonthlyCSV(); window.Blob = O; HTMLAnchorElement.prototype.click = oc; return { cap, name }; });
  const lines = csv.cap.trimEnd().split("\n");
  assert.equal(lines[1], "2026-01,1,100,1000,3000,2000,200,4,500");
  assert.equal(lines[2], "2026-02,1,0,2000,500,-1500,-75,6,-250");
  assert.equal(lines[3], "Total,2,50,3000,3500,500,16.7,10,50");
  assert.match(csv.name, /^PokerHQ_Monthly_\d{4}-\d{2}-\d{2}\.csv$/);
  ok("CSV: oldest first, bounties counted as returns, totals row adds up — " + csv.name);

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL MONTHLY REPORT CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
