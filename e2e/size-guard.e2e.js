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

  await page.evaluate(() => { window.hands = [{ id: 1, title: "big", desc: "x".repeat(780000) }]; });
  await render();
  let c = await card();
  assert.ok(c && !c.critical, "amber at ~75%");
  assert.match(c.text, /Hands is at 7\d% of the cloud size limit/);
  assert.match(c.text, /download a JSON backup/i);
  assert.doesNotMatch(c.text, /Saving will start failing/);
  ok("~75%: amber warning names the list and percentage — \"" + c.text.slice(0, 70) + "…\"");

  await page.evaluate(() => { window.hands = [{ id: 1, title: "big", desc: "x".repeat(990000) }]; window.sessions = [{ id: 2, name: "s", notes: "y".repeat(760000), total: 1, prize: 0, pnl: -1, result: "bust", date: "2026-01-01" }]; });
  await render();
  c = await card();
  assert.ok(c.critical, "red at 90%+");
  assert.match(c.text, /Hands is at 9\d%/);
  assert.match(c.text, /Saving will start failing soon/);
  assert.match(c.text, /1 other list is also getting large/);
  ok("~95%: red 'saving will start failing soon', and it notes the other large list");

  // caching: a change inside 30s isn't re-measured (cheap), but force refreshes
  await page.evaluate(() => { window.hands = []; window.sessions = []; renderReliability(); });
  assert.ok(await card(), "still shows from the 30s cache (renders are frequent)");
  await render();
  assert.equal(await card(), null, "and clears when re-measured");
  ok("measurement is cached 30s (renders are frequent) and clears once data shrinks");

  // sync says 'too large'
  await page.evaluate(() => { setSyncStatus("error", "Too large to sync", { tooLarge: "hands" }); });
  const detail = await page.textContent("#dashboard-reliability-wrap .reliability-detail");
  assert.match(detail, /too large to sync/i);
  const warn = await card();
  assert.ok(warn && warn.critical);
  assert.match(warn.text, /Hands has outgrown cloud sync/);
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
