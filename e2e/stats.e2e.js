const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1100, height: 900 }, expandDetails: true });
  const ok = (m) => console.log("ok  " + m);
  // empty state
  await page.evaluate(() => { window.sessions = []; switchGroup("home"); refreshDashboard(); });
  assert.match(await page.textContent("#venue-breakdown"), /Log sessions to compare venues/);
  assert.match(await page.textContent("#weekday-breakdown"), /compare days of the week/);
  ok("empty dashboard shows friendly placeholders");

  // demo data (20 sessions across 4 venues)
  await page.evaluate(() => { loadDemoMode(); });
  await page.waitForTimeout(200);
  const venues = await page.evaluate(() => [...document.querySelectorAll("#venue-breakdown tbody tr")].map((r) => r.children[0].textContent + "|" + r.children[1].textContent));
  assert.ok(venues.length >= 3, "several venues: " + venues.join(", "));
  assert.equal(venues.reduce((n, v) => n + parseInt(v.split("|")[1], 10), 0), 20, "session counts add up to all 20");
  const days = await page.evaluate(() => [...document.querySelectorAll("#weekday-breakdown tbody tr")].map((r) => r.children[0].textContent.trim()));
  assert.ok(days.every((d) => /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/.test(d)));
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const idx = days.map((d) => order.indexOf(d.slice(0, 3)));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b), "Mon→Sun order");
  ok("demo data: " + venues.length + " venues (counts sum to 20), weekdays in order: " + days.join(","));

  // venue names are escaped (data can come from AI/imports)
  await page.evaluate(() => { window._demoMode = false; window.sessions = [{ id: 1, name: "x", position: 1, field: 10, date: "2026-01-04", venue: "<img src=x onerror=window.__xss=1>", total: 1000, prize: 0, pnl: -1000, result: "bust" }]; syncGlobalAliases(); refreshDashboard(); });
  assert.equal(await page.evaluate(() => window.__xss), undefined, "venue text must not execute");
  assert.ok((await page.textContent("#venue-breakdown")).includes("<img src=x"), "shown as text");
  ok("venue names are HTML-escaped");

  await page.evaluate(() => { loadDemoMode(); });
  await page.waitForTimeout(150);
  await (await page.$("#venue-breakdown")).screenshot({ path: out("venue.png") });
  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL BREAKDOWN CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
