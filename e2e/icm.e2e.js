const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1100, height: 1100 } });
  const ok = (m) => console.log("ok  " + m);
  await page.evaluate(() => { switchGroup("play", "calculator"); calcSwitchMode("icmcalc"); });
  assert.ok(await page.isVisible("#icm-empty"), "empty state first");

  await page.fill("#icm-stacks", "42000 31000 18000 9000 5000");
  await page.fill("#icm-payouts", "250000 150000 90000 60000");
  assert.equal(await page.locator("#icm-tbody tr").count(), 5);
  assert.equal(await page.locator("#icm-hero option").count(), 5);
  // values agree with the module
  const dom = await page.evaluate(() => [...document.querySelectorAll("#icm-tbody tr")].map((r) => r.children[3].textContent));
  const want = await page.evaluate(() => PokerHQICM.icm([42000, 31000, 18000, 9000, 5000], [250000, 150000, 90000, 60000]).map((x) => "₱" + fmt(x)));
  assert.deepEqual(dom, want);
  ok("5 players → 5 rows; ICM values match the module");

  await page.selectOption("#icm-hero", "2");
  await page.selectOption("#icm-villain", "0");
  await page.fill("#icm-dead", "3000");
  const banner = await page.textContent("#icm-call");
  assert.match(banner, /Player 3 calling Player 1/);
  assert.match(banner, /NEED \d+\.\d% EQUITY/);
  assert.match(banner, /Chip EV alone says/);
  const need = parseFloat(banner.match(/NEED (\d+\.\d)%/)[1]);
  assert.ok(need > 20 && need < 100);
  ok("call analysis: " + banner.replace(/\s+/g, " ").slice(0, 140));

  // selections survive edits to the stacks text
  await page.fill("#icm-stacks", "42000 31000 18000 9000 5100");
  assert.equal(await page.inputValue("#icm-hero"), "2");
  assert.equal(await page.inputValue("#icm-villain"), "0");
  ok("hero/villain choices survive editing a stack");

  // same seat both sides → no call box
  await page.selectOption("#icm-villain", "2");
  assert.ok(!(await page.isVisible("#icm-call")));
  await page.selectOption("#icm-villain", "0");

  // errors
  await page.fill("#icm-payouts", "100 200");
  assert.match(await page.textContent("#icm-error"), /increase/i);
  await page.fill("#icm-payouts", "abc");
  assert.match(await page.textContent("#icm-error"), /"abc"/);
  assert.ok(!(await page.isVisible("#icm-results")));
  await page.fill("#icm-payouts", "250000 150000 90000 60000");
  assert.ok(await page.isVisible("#icm-results"));
  ok("bad input shows a readable error and recovers");

  await (await page.$("#calc-panel-icmcalc")).screenshot({ path: out("icm-desktop.png") });
  await page.setViewportSize({ width: 390, height: 1000 });
  await (await page.$("#calc-panel-icmcalc")).screenshot({ path: out("icm-phone.png") });

  // the old modes still work
  await page.evaluate(() => calcSwitchMode("icm"));
  assert.ok(await page.isVisible("#calc-advisor-empty"));
  await page.evaluate(() => calcSwitchMode("payout"));
  assert.ok(!(await page.isVisible("#calc-panel-icmcalc")));
  ok("switching back to the other calculators works");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
  console.log("\nALL ICM UI CHECKS PASSED");
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
