const assert = require("assert").strict;
const { boot, out } = require("./lib.js");
const S = require("./lib.js").OUT;
(async () => {
  const { page, realErrors, close } = await boot({ viewport: { width: 1100, height: 1400 } });
  const ok = (m) => console.log("ok  " + m);

  const seed = () => page.evaluate(() => {
    window.tourneys.length = 0;
    const add = (o) => window.tourneys.push(Object.assign({ status: "target", buyin: 3000 }, o));
    add({ id: 601, date: "2026-10-03", name: "Metro Saturday", venue: "Metro Card Club" });
    add({ id: 602, date: "2026-10-04", name: "Metro Sunday PKO", venue: "Metro Card Club", planning: true });
    add({ id: 603, date: "2026-10-10", name: "Metro Turbo", venue: "Metrocard Club, Pasig" });
    add({ id: 604, date: "2026-10-11", name: "Okada Main", venue: "Okada Manila", planning: true });
    add({ id: 605, date: "2026-10-17", name: "Okada Deepstack", venue: "Okada Manila, Parañaque" });
    add({ id: 606, date: "2026-10-18", name: "Solaire Opener", venue: "Solaire Resort North" });
    add({ id: 607, date: "2026-10-24", name: "Mystery Event", venue: "" });
    syncGlobalAliases();
    try { localStorage.removeItem("pokerhq_cal_venue"); } catch (e) {}
    calVenueFilter = ""; _calVenueSig = null; calPlannedOnly = false;
    calYear = 2026; calMonth = 9;
    switchGroup("plan", "calendar");
    renderCalendar();
  });
  await seed();

  const options = () => page.evaluate(() => [...document.querySelectorAll("#cal-venue-filter option")].map((o) => o.textContent.trim()));
  const monthBars = () => page.evaluate(() => [...document.querySelectorAll("#cal-days-grid .cal-event-bar")].map((b) => (b.getAttribute("title") || "").split(" · ")[0]).sort());
  const listRows = () => page.evaluate(() => [...document.querySelectorAll("#calendar-list [id^='event-row-']")].map((r) => r.id.replace("event-row-", "")).sort());
  const note = () => page.evaluate(() => { const n = document.getElementById("cal-venue-count"); return n.style.display === "none" ? "" : n.textContent.trim(); });
  const selected = () => page.evaluate(() => document.getElementById("cal-venue-filter").value);

  // 1. selector visible with the right choices (busiest first, spellings merged, no-venue last)
  assert.ok(await page.isVisible("#cal-venue-filter"), "selector visible");
  assert.deepEqual(await options(), [
    "All locations (7)", "Metro Card Club (3)", "Okada Manila (2)", "Solaire (1)", "(no venue) (1)"
  ]);
  ok("options: All + 3 real locations (Metro, Okada and Solaire spellings merged) + (no venue) last, with counts");

  // 2. everything shown by default
  assert.equal((await monthBars()).length, 7);
  const listAll = await listRows();
  assert.equal(listAll.length, 7);
  assert.equal(await note(), "");
  ok("default: all 7 events in the month grid and the list, no 'showing' note");

  // 3. pick Metro
  await page.selectOption("#cal-venue-filter", { label: "Metro Card Club (3)" });
  assert.deepEqual(await monthBars(), ["Metro Saturday", "Metro Sunday PKO", "Metro Turbo"]);
  assert.deepEqual(await listRows(), ["601", "602", "603"]);
  assert.equal(await note(), "Showing 3 of 7");
  assert.ok(await page.evaluate(() => document.getElementById("cal-venue-filter").classList.contains("active")));
  assert.equal(await page.evaluate(() => localStorage.getItem("pokerhq_cal_venue")), "metrocardclub");
  ok("Metro: month grid + list narrow to the 3 Metro events (\"Metrocard Club, Pasig\" spelling included), note says 'Showing 3 of 7', choice saved");

  // 4. the Playing These card and the choices don't change
  assert.deepEqual(await options(), ["All locations (7)", "Metro Card Club (3)", "Okada Manila (2)", "Solaire (1)", "(no venue) (1)"]);
  const planned = await page.evaluate(() => document.getElementById("planned-events-wrap").innerText);
  assert.match(planned, /Okada Main/, "Playing These card still lists the Okada pick");
  ok("choices stay complete, and the 'Playing These' card ignores the filter");

  // 5. combine with Planned only
  await page.click("#vbtn-planned");
  assert.deepEqual(await monthBars(), ["Metro Sunday PKO"]);
  assert.equal(await note(), "Showing 1 of 7");
  assert.deepEqual(await options(), ["All locations (7)", "Metro Card Club (3)", "Okada Manila (2)", "Solaire (1)", "(no venue) (1)"]);
  await page.selectOption("#cal-venue-filter", { label: "Solaire (1)" });
  assert.deepEqual(await monthBars(), []);
  const empty = await page.evaluate(() => document.getElementById("calendar-list").innerText);
  assert.match(empty, /No pinned events at this location/);
  await page.click("#vbtn-planned");
  ok("with Planned only: both filters apply together; empty result says so plainly");

  // 6. (no venue)
  await page.selectOption("#cal-venue-filter", { label: "(no venue) (1)" });
  assert.deepEqual(await monthBars(), ["Mystery Event"]);
  assert.deepEqual(await listRows(), ["607"]);
  ok("(no venue) shows events with no location");

  // 7. persistence across reload of the calendar state (page reload boots fresh)
  await page.selectOption("#cal-venue-filter", { label: "Okada Manila (2)" });
  const saved = await page.evaluate(() => localStorage.getItem("pokerhq_cal_venue"));
  assert.equal(saved, "okada");
  await page.evaluate(() => { calVenueFilter = localStorage.getItem("pokerhq_cal_venue") || ""; _calVenueSig = null; renderCalendar(); });
  assert.equal(await selected(), "okada");
  assert.deepEqual(await monthBars(), ["Okada Deepstack", "Okada Main"]);
  ok("Okada saved in this device's storage and restored on the next render");

  // 8. jumping to an event hidden by the filter clears it
  await page.evaluate(() => { switchGroup("home"); jumpToCalendarEvent(606); });
  await page.waitForTimeout(300);
  assert.equal(await selected(), "", "filter cleared so the target is visible");
  assert.equal(await page.evaluate(() => localStorage.getItem("pokerhq_cal_venue")), null);
  assert.ok(await page.evaluate(() => !!document.getElementById("event-row-606")), "target row exists");
  ok("jump to an event outside the filter clears the filter so the event shows");

  // 9. jumping to an event inside the filter keeps it
  await page.selectOption("#cal-venue-filter", { label: "Okada Manila (2)" });
  await page.evaluate(() => { switchGroup("home"); jumpToCalendarEvent(604); });
  await page.waitForTimeout(300);
  assert.equal(await selected(), "okada");
  ok("jump to an event inside the filter keeps the filter");

  // 10. stale saved location (events removed) resets to All
  await page.evaluate(() => { window.tourneys.splice(0, window.tourneys.length, ...window.tourneys.filter((t) => t.id !== 604 && t.id !== 605)); syncGlobalAliases(); renderCalendar(); });
  assert.equal(await selected(), "");
  assert.equal(await page.evaluate(() => localStorage.getItem("pokerhq_cal_venue")), null);
  assert.equal((await monthBars()).length, 5);
  assert.deepEqual(await options(), ["All locations (5)", "Metro Card Club (3)", "Solaire (1)", "(no venue) (1)"]);
  ok("when the chosen location has no events left, it resets to All and the list of choices updates");

  // 11. single-location calendar hides the selector
  await page.evaluate(() => { window.tourneys.splice(0, window.tourneys.length, ...window.tourneys.filter((t) => /Metro/.test(t.venue || ""))); syncGlobalAliases(); renderCalendar(); });
  assert.ok(!(await page.isVisible("#cal-venue-filter")), "hidden with one location");
  await page.evaluate(() => { window.tourneys.length = 0; syncGlobalAliases(); renderCalendar(); });
  assert.ok(!(await page.isVisible("#cal-venue-filter")), "hidden with none");
  ok("selector hides itself when there is only one location (or none)");

  // 12. names with HTML characters are escaped, never injected
  await page.evaluate(() => {
    window.tourneys.push({ id: 701, date: "2026-10-05", name: "A", venue: 'Bad "<b>Venue</b>" & Co', buyin: 1000, status: "target" });
    window.tourneys.push({ id: 702, date: "2026-10-06", name: "B", venue: "Okada", buyin: 1000, status: "target" });
    syncGlobalAliases(); _calVenueSig = null; renderCalendar();
  });
  assert.equal(await page.evaluate(() => document.querySelectorAll("#cal-venue-filter b").length), 0);
  assert.ok((await options()).some((o) => o.startsWith('Bad "<b>Venue</b>" & Co')));
  await page.selectOption("#cal-venue-filter", { index: 1 });
  assert.equal((await monthBars()).length, 1);
  ok("odd characters in a location name are shown as text and still filter correctly");

  // 13. screenshots
  await seed();
  await page.selectOption("#cal-venue-filter", { label: "Metro Card Club (3)" });
  await page.screenshot({ path: S + "/venue-desktop.png", fullPage: false, clip: { x: 0, y: 0, width: 1100, height: 1100 } });
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.evaluate(() => { const w = document.getElementById("cal-venue-wrap"); w.scrollIntoView({ block: "start" }); });
  await page.screenshot({ path: S + "/venue-phone.png" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, "no sideways scroll on phone (" + overflow + ")");
  ok("phone width: no sideways scroll");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
