"use strict";
// The month calendar's event bars: the full name is in the bar (CSS cuts it to the
// cell, not a fixed 14 characters), the text is a readable size, and seven equal
// columns hold at desktop, laptop and phone widths however long the names are.
const assert = require("assert").strict;
const { boot, freezeMotion } = require("./lib.js");

const LONG = "Road to APPT Manila Main Event Satellite Turbo Deepstack";

(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1912, height: 900 } });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  await page.evaluate((long) => {
    const y = new Date().getFullYear(), m = new Date().getMonth();
    const day = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    window.tourneys.length = 0;
    for (let k = 0; k < 4; k++) window.tourneys.push({ id: 100 + k, date: day(10), name: k === 0 ? long : "Sunday Storm " + k, venue: "Okada Manila", buyin: 2000, status: "target", type: "side" });
    window.tourneys.push({ id: 200, date: day(12), name: "Saturday Marathon", venue: "Okada Manila", buyin: 5000, status: "target", type: "main" });
    window.tourneys.push({ id: 300, date: day(20), name: "Main Event Qualifier Flight A", venue: "Okada Manila", buyin: 3000, status: "target", type: "side", isSatellite: true });
    syncGlobalAliases(); switchGroup("plan", "calendar"); setView("month"); renderCalendar();
  }, LONG);

  for (const [name, width] of [["desktop", 1912], ["laptop", 1280], ["phone", 390]]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    const r = await page.evaluate((long) => {
      const cells = [...document.querySelectorAll("#cal-days-grid .cal-day")];
      const widths = cells.slice(0, 7).map((c) => c.getBoundingClientRect().width);
      const bar = [...document.querySelectorAll("#cal-days-grid .cal-event-bar")].find((b) => b.textContent === long);
      const cs = getComputedStyle(bar);
      const grid = document.getElementById("cal-days-grid").getBoundingClientRect();
      return {
        widths, spread: Math.max(...widths) - Math.min(...widths), fullName: !!bar, size: parseFloat(cs.fontSize), weight: cs.fontWeight, family: cs.fontFamily,
        barInsideCell: bar.getBoundingClientRect().right <= bar.parentElement.getBoundingClientRect().right + 0.5,
        pageOverflow: document.documentElement.scrollWidth - innerWidth, gridRight: grid.right, vw: innerWidth,
      };
    }, LONG);
    assert.ok(r.fullName, name + ": the bar carries the whole event name, not a 14-character cut");
    assert.ok(r.spread <= 1, name + ": the seven columns are equal width (spread " + r.spread.toFixed(1) + "px): " + r.widths.map(Math.round));
    assert.ok(r.barInsideCell, name + ": a long name is cut inside its own cell");
    assert.ok(r.pageOverflow <= 0, name + ": the page scrolls sideways by " + r.pageOverflow + "px");
    assert.ok(r.gridRight <= r.vw + 1, name + ": the calendar runs off the right edge");
    assert.match(r.family, /DM Sans/, name + ": bars use the sans font");
    assert.ok(parseInt(r.weight, 10) <= 500, name + ": bar weight " + r.weight + " is one that is really loaded");
    assert.ok(r.size >= (width < 769 ? 10 : 12), name + ": bar text is " + r.size + "px, too small");
    ok(name + " " + width + "px: full names in the bars at " + r.size + "px, seven equal columns, nothing runs off the side");
  }

  // a name that fits is shown whole, a longer one ends in an ellipsis at the cell edge (not before it)
  await page.setViewportSize({ width: 1912, height: 900 });
  const fit = await page.evaluate((long) => {
    const bars = [...document.querySelectorAll("#cal-days-grid .cal-event-bar")];
    const short = bars.find((b) => b.textContent === "Sunday Storm 1");
    const big = bars.find((b) => b.textContent === long);
    return { shortClipped: short.scrollWidth > short.clientWidth, bigClipped: big.scrollWidth > big.clientWidth, bigWidth: big.getBoundingClientRect().width, bigTextOver: big.scrollWidth };
  }, LONG);
  assert.equal(fit.shortClipped, false, "a short name is not clipped on a wide screen");
  ok("on a wide screen short names show whole; a very long name is trimmed by the cell edge only");

  // a multi-day event (stored as "2026-mm-15 to 2026-mm-17") shows on every day; the continuation days start with an arrow
  await page.evaluate(() => {
    const d = new Date(), ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    tourneys.push({ id: 400, date: ym + "-15 to " + ym + "-17", name: "Three Day Festival Main", venue: "Okada Manila", buyin: 9000, status: "stretch", type: "main" });
    syncGlobalAliases(); renderCalendar();
  });
  const labels = await page.$$eval("#cal-days-grid .cal-event-bar", (bs) => bs.map((b) => b.textContent).filter((t) => /Three Day Festival Main/.test(t)));
  assert.deepEqual(labels, ["Three Day Festival Main", "↳ Three Day Festival Main", "↳ Three Day Festival Main"]);
  ok("a 3-day event keeps its full name on each day, with ↳ on the continuation days");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
