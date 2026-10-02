const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1100, height: 900 } });
  const ok = (m) => console.log("ok  " + m);
  const card = () => page.evaluate(() => { const w = document.querySelector("#dashboard-reliability-wrap .reliability-warn"); return w ? { text: w.textContent, critical: w.classList.contains("critical") } : null; });
  const render = () => page.evaluate(() => { switchGroup("home"); getCloudSizeWarnings(true); renderReliability(); });
  const bigHands = (bytes) => `window.hands = [{id:1, title:'x', desc:'${"x".repeat(1)}'.repeat(1)}]; window.hands[0].desc = 'x'.repeat(${bytes});`;

  await render();
  assert.equal(await card(), null);
  ok("small data: no warning");

  await page.evaluate(() => { window.hands = [{ id: 1, title: "big", desc: "x".repeat(990000) }]; window.sessions = [{ id: 2, name: "s", notes: "y".repeat(760000), total: 1, prize: 0, pnl: -1, result: "bust", date: "2026-01-01" }]; });
  await render();
  assert.equal(await card(), null, "large logical lists are automatically sharded, not presented as doomed saves");
  ok("large lists do not show obsolete 1 MiB warnings because sync shards them automatically");

  // sync says 'too large'
  await page.evaluate(() => { setSyncStatus("error", "Too large to sync", { tooLarge: "hands" }); });
  const detail = await page.textContent("#dashboard-reliability-wrap .reliability-detail");
  assert.match(detail, /too large to sync/i);
  const warn = await card();
  assert.ok(warn && warn.critical);
  assert.match(warn.text, /Hands could not be split for cloud sync/);
  assert.match(await page.textContent("#dashboard-reliability-wrap .reliability-pill"), /Too large to sync/);
  ok("a refused save shows 'Too large to sync' with what to do");
  await page.evaluate(() => { setSyncStatus("ok", "Synced"); });
  assert.equal(await card(), null);

  // demo mode never nags
  await page.evaluate(() => { loadDemoMode(); window.hands = [{ id: 1, title: "big", desc: "x".repeat(990000) }]; getCloudSizeWarnings(true); renderReliability(); });
  assert.equal(await card(), null);
  ok("demo mode is never flagged");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL SIZE-GUARD CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
