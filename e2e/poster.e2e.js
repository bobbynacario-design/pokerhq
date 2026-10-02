"use strict";
// Event Poster Import: choose a photo, Claude (mocked here) reads it, you confirm each event, and only
// then does anything reach the calendar. The real picture handling runs (decode, shrink, JPEG); only the
// AI call is replaced, so we can also check exactly what would be sent.
const assert = require("assert").strict;
const { boot, freezeMotion } = require("./lib.js");

(async () => {
  const { page, realErrors, dialogs, close } = await boot({ viewport: { width: 1280, height: 1000 } });
  const ok = (m) => console.log("ok  " + m);
  await freezeMotion(page);
  const settle = (ms = 150) => page.waitForTimeout(ms);
  const text = async (sel) => (await page.textContent(sel)).replace(/\s+/g, " ").trim();
  await page.evaluate(() => { window.tourneys.length = 0; window.trips.length = 0; window.bankroll = { amount: 100000, rule: 5 }; syncGlobalAliases(); });

  // dates relative to today, so the test never goes stale
  const dates = await page.evaluate(() => { const t = todayLocal(); const add = (n) => { const d = new Date(t + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }; return { today: t, d10: add(10), d11: add(11), d12: add(12), d13: add(13), old: add(-60) }; });
  const fixture = {
    events: [
      { name: "Poster Main Event", date: dates.d10, endDate: "", time: "14:00", venue: "Okada Manila", buyin: 5500, currency: "PHP", gtd: "₱1,000,000", structure: "Regular", category: "main", notes: "Late reg 2 levels", uncertain: [] },
      { name: "Turbo Tuesday", date: dates.d11, endDate: "", time: "19:00", venue: "Okada Manila", buyin: 2200, currency: "PHP", gtd: "", structure: "Turbo", category: "side", notes: "", uncertain: ["time"] },
      { name: "APT High Roller", date: dates.d12, endDate: "", time: "", venue: "Okada Manila", buyin: 500, currency: "USD", gtd: "$50K", structure: "Regular", category: "side", notes: "", uncertain: [] },
      { name: "Mystery Event", date: "", endDate: "", time: "", venue: "Okada Manila", buyin: 3000, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: ["date"] },
      { name: "Weekend Special", date: dates.d13, endDate: "", time: "12:00", venue: "Metro Card Club", buyin: 3300, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: [] },
      { name: "Last Year's Finale", date: dates.old, endDate: "", time: "", venue: "Okada Manila", buyin: 1000, currency: "PHP", gtd: "", structure: "Regular", category: "side", notes: "", uncertain: [] },
      { name: "Main Event Satellite", date: dates.d10, endDate: "", time: "11:00", venue: "Okada Manila", buyin: 1100, currency: "PHP", gtd: "", structure: "Regular", category: "satellite", notes: "", uncertain: [] },
    ],
    posterNotes: "Ignored the cash game list.",
  };
  // one event is already on the calendar
  await page.evaluate((d) => { tourneys.push({ id: 424242, date: d, name: "Weekend Special", venue: "Metro Card Club", buyin: 3300, status: "target", type: "side" }); syncGlobalAliases(); }, dates.d13);

  // the AI call is replaced; everything before and after it is the real code
  await page.evaluate((fx) => {
    window.__sent = [];
    window.__aiMode = "ok";
    window.__aiFixture = fx;
    window.callAnthropicMessages = async (body) => {
      window.__sent.push(JSON.parse(JSON.stringify(body)));
      if (window.__aiMode === "hang") return new Promise(() => {});
      if (window.__aiMode === "401") return { ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) };
      if (window.__aiMode === "500") return { ok: false, status: 500, json: async () => ({ error: { message: "overloaded" } }) };
      if (window.__aiMode === "throw") throw new Error("network down");
      const out = window.__aiMode === "garbage" ? "I cannot read this image, sorry." : window.__aiMode === "empty" ? JSON.stringify({ events: [], posterNotes: "" }) : JSON.stringify(window.__aiFixture);
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: out }] }) };
    };
  }, fixture);
  // a big test photo made in the page (3000 x 2000), handed to the file box as a real file
  const photo = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 3000; c.height = 2000;
    const g = c.getContext("2d"); g.fillStyle = "#123"; g.fillRect(0, 0, 3000, 2000); g.fillStyle = "#fc0"; g.font = "bold 200px sans-serif"; g.fillText("POKER SERIES", 200, 600);
    for (let i = 0; i < 4000; i++) { g.fillStyle = "hsl(" + (i * 7 % 360) + ",70%,50%)"; g.fillRect((i * 37) % 3000, (i * 91) % 2000, 20, 20); }   // noise, so the file is not tiny
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const photoBuffer = Buffer.from(photo, "base64");

  // 1. the button, the pop-up, and nothing to read until a photo is chosen
  await page.evaluate(() => switchGroup("plan", "calendar"));
  await settle();
  assert.equal(await page.isVisible("#cal-poster-btn"), true);
  await page.click("#cal-poster-btn");
  await page.waitForSelector("#modal-poster.open");
  assert.equal(await page.isDisabled("#poster-read-btn"), true);
  assert.match(await text("#poster-file-name"), /No photo chosen yet/);
  assert.match(await text("#poster-stage-pick"), /The photo is sent to Claude to be read. PokerHQ doesn't keep it./);
  ok("IMPORT POSTER opens the pop-up; READ POSTER stays off until a photo is chosen; it says the photo isn't kept");

  // 2. a file that is not a picture is refused
  await page.setInputFiles("#poster-file", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  assert.match(await text("#poster-error"), /not a picture/);
  assert.equal(await page.isDisabled("#poster-read-btn"), true);
  ok("a file that isn't a picture is refused");

  // 3. choose the photo: a preview appears
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => document.getElementById("poster-preview").style.display !== "none");
  assert.equal(await page.isDisabled("#poster-read-btn"), false);
  assert.match(await text("#poster-file-name"), /poster\.png/);
  assert.equal(await page.isVisible("#poster-error"), false);
  ok("choosing a photo shows a preview and enables READ POSTER");

  // 4. reading: what is actually sent to Claude
  await page.fill("#poster-hint", "Okada Manila, October series");
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  const sent = await page.evaluate(() => window.__sent);
  assert.equal(sent.length, 1);
  const req = sent[0];
  assert.equal(req.model, "claude-sonnet-4-6");
  assert.equal(req.max_tokens, 6000);
  assert.equal(req.output_config.format.type, "json_schema");
  const [img, prompt] = req.messages[0].content;
  assert.equal(img.type, "image");
  assert.equal(img.source.type, "base64");
  assert.equal(img.source.media_type, "image/jpeg", "re-encoded as a JPEG");
  const dims = await page.evaluate((b64) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = "data:image/jpeg;base64," + b64; }), img.source.data);
  assert.ok(Math.max(...dims) <= 1568 && Math.max(...dims) >= 1500, "shrunk from 3000x2000 to " + dims.join("x"));
  assert.ok(Math.abs(dims[0] / dims[1] - 1.5) < 0.02, "proportions kept");
  const decodedBytes = Math.floor(img.source.data.length * 3 / 4);
  assert.ok(decodedBytes < 4 * 1024 * 1024 && decodedBytes > 5000, "a sensible size: " + decodedBytes);
  assert.equal(prompt.type, "text");
  assert.ok(prompt.text.includes("Today's date is " + dates.today));
  assert.ok(prompt.text.includes("Extra context from the player: Okada Manila, October series"));
  assert.match(prompt.text, /Answer with JSON matching the schema and nothing else/);
  assert.ok(prompt.text.includes("CALENDAR") && prompt.text.includes(dates.today), "a day-by-day calendar goes with it, so weekday names become dates");
  ok("Claude gets one JPEG (3000x2000 shrunk to " + dims.join("x") + ", " + Math.round(decodedBytes / 1024) + " KB), today's date, the player's hint and a JSON-only instruction");

  // 5. the confirmation screen
  assert.equal(await page.locator(".poster-card").count(), 7);
  assert.match(await text("#poster-summary"), /Found 7 events\. 2 need a fix before they can be added, 1 already on your calendar, 2 to double-check\./);
  assert.match(await text("#poster-notes"), /Ignored the cash game list\./);
  const state = await page.$$eval(".poster-card", (cs) => cs.map((c) => ({ name: c.querySelector('[data-field="name"] input').value, on: c.querySelector(".poster-include input").checked, disabled: c.querySelector(".poster-include input").disabled, dup: c.classList.contains("dup"), blocked: c.classList.contains("blocked") })));
  const byName = Object.fromEntries(state.map((s) => [s.name, s]));
  assert.equal(byName["Poster Main Event"].on, true);
  assert.equal(byName["Turbo Tuesday"].on, true, "unsure of the time only: still ticked, with a warning");
  assert.deepEqual([byName["APT High Roller"].on, byName["APT High Roller"].disabled], [false, true], "USD with no rate is blocked");
  assert.deepEqual([byName["Mystery Event"].on, byName["Mystery Event"].disabled], [false, true], "no date is blocked");
  assert.deepEqual([byName["Weekend Special"].on, byName["Weekend Special"].dup], [false, true], "already on the calendar: not ticked");
  assert.equal(byName["Last Year's Finale"].on, true);
  assert.match(await text('.poster-card:has([data-field="name"] input[value="Weekend Special"]) .poster-badge'), /Already on your calendar: Weekend Special/);
  assert.match(await text('.poster-card:has([data-field="name"] input[value="Last Year\'s Finale"]) .poster-issues'), /more than a month ago/);
  assert.match(await text('.poster-card:has([data-field="name"] input[value="Turbo Tuesday"]) .poster-issues'), /wasn't sure of the start time/);
  assert.equal(await page.isDisabled("#poster-add-btn"), false);
  assert.match(await text("#poster-add-btn"), /ADD 4 TO CALENDAR/);
  ok("7 events: 4 ticked and ready, the USD one and the dateless one blocked, the duplicate unticked and badged, warnings shown");

  // 6. fix what is blocked: an exchange rate, a date
  const usd = page.locator('.poster-card:has([data-field="name"] input[value="APT High Roller"])');
  await usd.locator('[data-field="rate"] input').fill("58.4");
  assert.equal(await text('.poster-card:has([data-field="name"] input[value="APT High Roller"]) .poster-peso'), "= ₱29,200");
  assert.equal(await usd.locator(".poster-include input").isDisabled(), false, "a rate unblocks it");
  await usd.locator(".poster-include input").check();
  const mystery = page.locator('.poster-card:has([data-field="name"] input[value="Mystery Event"])');
  await mystery.locator('[data-field="date"] input').fill(dates.d12);
  assert.equal(await mystery.locator(".poster-include input").isDisabled(), false);
  await mystery.locator(".poster-include input").check();
  await mystery.locator('[data-field="name"] input').fill("Mystery Event (fixed)");
  assert.equal(await mystery.locator('[data-field="name"] input').evaluate((el) => document.activeElement === el), true, "typing in a card doesn't lose the cursor");
  assert.match(await text("#poster-add-btn"), /ADD 6 TO CALENDAR/);
  assert.match(await text("#poster-summary"), /Found 7 events\. 1 already on your calendar/);
  // a foreign amount changes its peso preview as you type, and going back to pesos drops the rate box
  await usd.locator('[data-field="buyin"] input').fill("600");
  assert.equal(await text('.poster-card:has([data-field="name"] input[value="APT High Roller"]) .poster-peso'), "= ₱35,040");
  await usd.locator("select").first().selectOption("PHP");
  assert.equal(await usd.locator('[data-field="rate"]').count(), 0);
  await usd.locator("select").first().selectOption("USD");
  assert.equal(await usd.locator('[data-field="rate"] input').inputValue(), "58.4", "the rate you typed is kept");
  await usd.locator('[data-field="buyin"] input').fill("500");
  ok("fixing the rate and the date unblocks them; typing keeps the cursor; the peso preview follows the amount and currency");

  // also tick the duplicate: the calendar's own duplicate check will still refuse it, and we say so
  await page.locator('.poster-card:has([data-field="name"] input[value="Weekend Special"]) .poster-include input').check();
  assert.match(await text("#poster-add-btn"), /ADD 7 TO CALENDAR/);

  // 7. add: exactly what was confirmed reaches the calendar, in the calendar's own shape
  const before = await page.evaluate(() => tourneys.length);
  await page.click("#poster-add-btn");
  await settle(200);
  assert.equal(await page.evaluate(() => document.getElementById("modal-poster").classList.contains("open")), false);
  const after = await page.evaluate(() => ({ n: tourneys.length, poster: tourneys.filter((t) => t.source === "Poster photo").map((t) => ({ name: t.name, date: t.date, time: t.time, venue: t.venue, buyin: t.buyin, gtd: t.gtd, structure: t.structure, type: t.type, category: t.category, sat: t.sat, notes: t.notes, status: t.status, day: t.day, month: t.month, url: t.url })) }));
  assert.equal(after.n - before, 6, "6 added; the duplicate was skipped");
  const P = Object.fromEntries(after.poster.map((t) => [t.name, t]));
  assert.deepEqual(P["Poster Main Event"], { name: "Poster Main Event", date: dates.d10, time: "14:00", venue: "Okada Manila", buyin: 5500, gtd: "₱1,000,000", structure: "Regular", type: "main", category: "main", sat: false, notes: "Late reg 2 levels", status: "target", day: String(Number(dates.d10.slice(8))), month: ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][Number(dates.d10.slice(5, 7)) - 1], url: "" });
  assert.equal(P["APT High Roller"].buyin, 29200, "USD 500 at 58.4, in pesos");
  assert.equal(P["APT High Roller"].notes, "Poster price: USD 500");
  assert.equal(P["Main Event Satellite"].sat, true);
  assert.equal(P["Main Event Satellite"].structure, "Satellite / Qualifier");
  assert.equal(P["Turbo Tuesday"].structure, "Turbo");
  assert.ok(P["Mystery Event (fixed)"], "the edited name and date were used");
  assert.equal(P["Mystery Event (fixed)"].date, dates.d12);
  assert.match(await text("#undo-toast-label"), /^Added 6 events from the poster \(1 already there\)/);
  const mo = await page.evaluate(() => [calYear, calMonth]);
  assert.deepEqual(mo, [Number(dates.d10.slice(0, 4)), Number(dates.d10.slice(5, 7)) - 1], "the calendar jumped to the month of the first upcoming new event (not last year's finale)");
  const cloud = await page.evaluate(() => { for (const [p, v] of globalThis.__cloud.docs) if (p.endsWith("/tourneys")) return JSON.parse(v.value).filter((t) => t.source === "Poster photo").length; return null; });
  assert.equal(cloud, 6, "saved to the cloud copy");
  ok("6 events added in the calendar's own shape (ISO date, start time, pesos, satellite tagged, USD price kept in the notes); the duplicate was skipped and said so");

  // 8. UNDO removes exactly those and nothing else
  await page.click("#undo-toast .toast-btn");
  await settle();
  assert.equal(await page.evaluate(() => tourneys.length), before);
  assert.equal(await page.evaluate(() => tourneys.some((t) => t.id === 424242)), true, "the event that was already there is untouched");
  ok("UNDO takes out the poster events and leaves the rest of the calendar alone");

  // 8b. an event that lands in another year must never be invisible: no year printed -> moved to the coming one;
  // a printed past year -> kept, but the list shows the year and the toast says where the calendar went
  const yr = Number(dates.today.slice(0, 4));
  const readOne = async (ev) => {
    await page.evaluate((e) => { window.__aiFixture = { events: [e], posterNotes: "" }; window.__aiMode = "ok"; }, ev);
    await page.evaluate(() => { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); setView("month"); });
    await page.click("#cal-poster-btn");
    await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
    await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
    await page.click("#poster-read-btn");
    await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  };
  const noYear = { name: "No Year Main", date: (yr - 1) + "-" + dates.d10.slice(5), endDate: "", time: "14:00", venue: "Okada Manila", buyin: 5500, currency: "PHP", gtd: "", structure: "Regular", category: "main", notes: "", uncertain: ["date"] };
  await readOne(noYear);
  assert.equal(await page.inputValue('[data-field="date"] input'), dates.d10, "the guessed past year was moved to the coming one");
  assert.match(await text(".poster-issues"), new RegExp("No year was printed, so Claude's date \\(" + noYear.date + "\\) was moved to the next one coming up"));
  assert.doesNotMatch(await text(".poster-issues"), /more than a month ago/);
  await page.click("#poster-add-btn");
  await settle(200);
  const inGrid = async () => page.$$eval("#cal-days-grid .cal-event-bar", (b) => b.map((x) => x.textContent.trim()));
  assert.deepEqual((await inGrid()).filter((n) => n === "No Year Main").length > 0, true, "it is on the month grid the player is looking at");
  assert.doesNotMatch(await text("#undo-toast-label"), /showing/, "the calendar did not have to move, so the toast does not say it did");
  await page.click("#undo-toast .toast-btn"); await settle();
  ok("a poster with no year never lands in a past year: the date moves to the next one coming up, is warned about, and shows on this month's grid");

  const printed = Object.assign({}, noYear, { name: "Printed Old Year", uncertain: [] });
  await readOne(printed);
  assert.equal(await page.inputValue('[data-field="date"] input'), printed.date, "a printed year is left as printed");
  assert.match(await text(".poster-issues"), /more than a month ago/);
  await page.click("#poster-add-btn");
  await settle(200);
  assert.match(await text("#undo-toast-label"), new RegExp("^Added 1 event from the poster · showing \\w+ " + (yr - 1) + "$"), "the toast says the calendar moved, and to where");
  await page.evaluate(() => { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar(); setView("list"); });
  assert.match(await text('#calendar-list .event-row:has(.event-name:text("Printed Old Year")) .event-date-box'), new RegExp(dates.d10.slice(8).replace(/^0/, "") + "\\s*" + "\\w{3}" + "\\s*" + (yr - 1)), "the list says which year");
  assert.equal(await page.$$eval("#cal-days-grid .cal-event-bar", (b) => b.filter((x) => x.textContent.trim() === "Printed Old Year").length), 0, "and it is rightly not on this year's grid");
  await page.evaluate(() => setView("month"));
  await page.click("#undo-toast .toast-btn"); await settle();
  ok("a printed past year is kept, but the list shows the year and the toast says which month the calendar moved to");
  await page.evaluate((fx) => { window.__aiFixture = fx; }, fixture);   // the later sections read the original seven events

  // 8c. an event that runs several days (a "Metro 1M" that is already under way and ends on Sunday) is drawn across
  // every one of its days on the month grid, and the last day can be fixed afterwards on the Add/Edit form
  const span = await page.evaluate(() => {
    const add = (n) => { const d = new Date(todayLocal() + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    return { start: add(-1), end: add(2) };
  });
  // how many of those 4 days the month grid on screen can show (the grid is 6 weeks from the Sunday before the 1st)
  const visibleDays = () => page.evaluate(({ start, end }) => {
    const first = new Date(calYear, calMonth, 1 - new Date(calYear, calMonth, 1).getDay()); first.setHours(0, 0, 0, 0);
    const last = new Date(first); last.setDate(last.getDate() + 41);
    let n = 0; for (let d = new Date(start + "T00:00:00"); d <= new Date(end + "T00:00:00"); d.setDate(d.getDate() + 1)) if (d >= first && d <= last) n++;
    return n;
  }, span);
  const barsOf = (name) => page.$$eval("#cal-days-grid .cal-event-bar", (b, n) => b.filter((x) => x.textContent.replace("↳", "").trim() === n).map((x) => x.className.replace(/\s+/g, " ")), name);
  const metro = { name: "Metro 1M Guaranteed", date: span.start, endDate: span.end, time: "13:00", venue: "Metro Card Club", buyin: 5500, currency: "PHP", gtd: "₱1,000,000", structure: "Regular", category: "main", notes: "", uncertain: [] };
  await readOne(metro);
  assert.equal(await page.inputValue('[data-field="endDate"] input'), span.end, "the poster's last day is on the card, where it can be checked");
  await page.click("#poster-add-btn");
  await settle(200);
  const stored = await page.evaluate(() => tourneys.find((t) => t.name === "Metro 1M Guaranteed"));
  assert.equal(stored.date, span.start + " to " + span.end, "saved as a range, not just its first day");
  const bars = await barsOf("Metro 1M Guaranteed");
  assert.equal(bars.length, await visibleDays(), "one bar for every day it runs that the grid shows: " + bars.length);
  assert.ok(bars.length >= 2, "more than just its first day");
  assert.ok(bars.every((c) => /\b(start|mid|end|solo)\b/.test(c)));
  assert.doesNotMatch(await text("#undo-toast-label"), /showing/, "it is running now, so the calendar stays on this month");
  const ics = await page.evaluate(() => { const r = parseTourneyDateRange(tourneys.find((t) => t.name === "Metro 1M Guaranteed")); return [toDateInputValue(r.start), toDateInputValue(r.end)]; });
  assert.deepEqual(ics, [span.start, span.end], "the rest of the app (calendar file, today's glance, alerts) reads the same start and end");
  ok("a multi-day poster event is saved as a range and drawn across every day it runs");

  // the same event added by an older version of the poster import: one day only. The Add/Edit form can now give it its last day.
  await page.evaluate(({ start }) => { tourneys.push({ id: 515151, date: start, day: "1", month: "OCT", name: "One-day Metro", venue: "Metro Card Club", buyin: 5500, status: "target", type: "main" }); syncGlobalAliases(); renderCalendar(); }, span);
  assert.equal((await barsOf("One-day Metro")).length > 0, true);
  const before1 = (await barsOf("One-day Metro")).length;
  await page.evaluate(() => editTourney(515151));
  assert.equal(await page.inputValue("#t-enddate"), "", "a one-day event shows no last day");
  await page.fill("#t-enddate", span.start);
  const dialogsBefore = dialogs.length;
  await page.evaluate(() => addTourney());
  await settle(150);
  assert.match((dialogs[dialogsBefore] || {}).message || "", /last day has to be after the first day/);
  assert.equal(await page.evaluate(() => document.getElementById("modal-tourney").classList.contains("open")), true, "a last day that is not after the first is refused and the form stays open");
  await page.fill("#t-enddate", span.end);
  await page.evaluate(() => addTourney());
  await settle(150);
  assert.equal(await page.evaluate(() => tourneys.find((t) => t.id === 515151).date), span.start + " to " + span.end);
  assert.equal((await barsOf("One-day Metro")).length, await visibleDays(), "now it is drawn across its days");
  assert.ok((await barsOf("One-day Metro")).length > before1 || before1 === (await visibleDays()));
  await page.evaluate(() => editTourney(515151));
  assert.equal(await page.inputValue("#t-enddate"), span.end, "the last day comes back when it is edited again");
  await page.fill("#t-enddate", "");
  await page.evaluate(() => addTourney());
  assert.equal((await barsOf("One-day Metro")).length, 1, "clearing the last day makes it a one-day event again");
  // adding a new event by hand with a last day
  await page.evaluate(() => openNewTourneyModal());
  await page.fill("#t-date", span.start); await page.fill("#t-enddate", span.end); await page.fill("#t-name", "Hand-made series");
  await page.evaluate(() => addTourney());
  assert.equal(await page.evaluate(() => tourneys.find((t) => t.name === "Hand-made series").date), span.start + " to " + span.end);
  assert.equal((await barsOf("Hand-made series")).length, await visibleDays());
  ok("the Add/Edit Tournament form takes a Last Day: it validates it, draws the range, shows it again on edit, and clearing it makes a one-day event");
  await page.evaluate(() => { tourneys = tourneys.filter((t) => !["Metro 1M Guaranteed", "One-day Metro", "Hand-made series"].includes(t.name)); window.tourneys = tourneys; syncGlobalAliases(); renderCalendar(); });
  await page.evaluate((fx) => { window.__aiFixture = fx; }, fixture);

  // 8d. the Metro case: the event is already on the calendar as ONE day (an older import), and the reading has no last day
  // but the poster says "Thu–Sun". The last day is worked out from the printed text, the card shows the evidence, and
  // adding updates the existing entry instead of making a second one. UNDO puts the one-day entry back.
  const run = await page.evaluate(() => {
    const t = todayLocal(), add = (n) => { const d = new Date(t + "T12:00:00"); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    // a Thursday at or just before today, and the Sunday after it
    const back = (new Date(t + "T12:00:00").getDay() - 4 + 7) % 7;
    return { thu: add(-back), sun: add(-back + 3) };
  });
  await page.evaluate((r) => { tourneys.push({ id: 616161, date: r.thu, day: String(Number(r.thu.slice(8))), month: "X", name: "Metro 1M Guaranteed", venue: "Metro Card Club", buyin: 5500, status: "target", type: "main" }); syncGlobalAliases(); renderCalendar(); }, run);
  const countBefore = await page.evaluate(() => tourneys.length);
  await readOne({ name: "Metro 1M Guaranteed", date: run.thu, endDate: "", printedDates: "Thu–Sun", time: "13:00", venue: "Metro Card Club", buyin: 5500, currency: "PHP", gtd: "₱1,000,000", structure: "Regular", category: "main", notes: "", uncertain: [] });
  assert.equal(await page.inputValue('[data-field="endDate"] input'), run.sun, "the last day was worked out from 'Thu–Sun'");
  assert.match(await text(".poster-says"), /Poster says: “?"?Thu–Sun/);
  assert.match(await text(".poster-issues"), new RegExp("Last day worked out from \"Thu–Sun\": Sunday " + run.sun));
  assert.match(await text(".poster-badge"), /Updates the one-day entry already on your calendar/);
  assert.equal(await page.isChecked(".poster-include input"), true);
  assert.match(await text("#poster-summary"), /1 will update an entry you already have/);
  assert.match(await text("#poster-add-btn"), /^UPDATE 1 ON CALENDAR/, "the button says what it will do");
  await page.click("#poster-add-btn");
  await settle(200);
  const after2 = await page.evaluate(() => ({ n: tourneys.length, t: tourneys.find((x) => x.id === 616161) }));
  assert.equal(after2.n, countBefore, "no second entry");
  assert.equal(after2.t.date, run.thu + " to " + run.sun, "the existing entry now runs Thursday to Sunday");
  assert.equal(after2.t.time, "13:00", "and picked up the start time it was missing");
  assert.match(await text("#undo-toast-label"), /^Updated 1 already on your calendar from the poster/);
  assert.equal((await barsOf("Metro 1M Guaranteed")).length, await page.evaluate(({ thu, sun }) => {
    const first = new Date(calYear, calMonth, 1 - new Date(calYear, calMonth, 1).getDay()); first.setHours(0, 0, 0, 0);
    const last = new Date(first); last.setDate(last.getDate() + 41);
    let n = 0; for (let d = new Date(thu + "T00:00:00"); d <= new Date(sun + "T00:00:00"); d.setDate(d.getDate() + 1)) if (d >= first && d <= last) n++;
    return n;
  }, run), "drawn across Thursday to Sunday");
  await page.click("#undo-toast .toast-btn"); await settle();
  const undone = await page.evaluate(() => tourneys.find((x) => x.id === 616161));
  assert.equal(undone.date, run.thu, "UNDO puts the one-day entry back as it was");
  assert.equal(undone.time, undefined);
  await page.evaluate(() => { tourneys = tourneys.filter((t) => t.id !== 616161); window.tourneys = tourneys; syncGlobalAliases(); renderCalendar(); });
  await page.evaluate((fx) => { window.__aiFixture = fx; }, fixture);
  ok("the Metro case: 'Thu–Sun' fills in the missing last day, the card shows what the poster says, and re-scanning updates the one-day entry (UNDO restores it)");

  // 9. things that go wrong say so plainly and leave you where you were
  const tryRead = async (mode) => {
    await page.evaluate((m) => { window.__aiMode = m; }, mode);
    await page.click("#cal-poster-btn");
    await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
    await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
    await page.click("#poster-read-btn");
    await page.waitForSelector("#poster-stage-pick", { state: "visible" });
    const err = await text("#poster-error");
    await page.evaluate(() => closePosterImport());
    return err;
  };
  assert.match(await tryRead("401"), /Claude rejected the API key \(401\)/);
  assert.match(await tryRead("500"), /Claude could not read the poster: overloaded/);
  assert.match(await tryRead("garbage"), /No tournaments were found on that poster/);
  assert.match(await tryRead("empty"), /No tournaments were found on that poster/);
  assert.match(await tryRead("throw"), /network down/);
  assert.equal(await page.evaluate(() => tourneys.length), before, "nothing was added by any of them");
  ok("a rejected key, a server error, an unreadable answer, no events and a network failure each show a clear message and add nothing");

  // an image the browser cannot decode
  await page.evaluate(() => { window.__aiMode = "ok"; });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("this is not an image") });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-pick", { state: "visible" });
  assert.match(await text("#poster-error"), /Could not open that picture/);
  assert.equal(await page.evaluate(() => window.__sent.length), 1 + 2 + 1 + 1 + 5, "nothing was sent for a picture that could not be opened");
  await page.evaluate(() => closePosterImport());
  ok("a picture that can't be opened is reported and nothing is sent");

  // 10. cancel while it is reading: a late answer is ignored
  await page.evaluate(() => { window.__aiMode = "ok"; const real = window.callAnthropicMessages; window.__release = null; window.callAnthropicMessages = (b) => new Promise((resolve) => { window.__release = () => resolve(real(b)); }); });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-reading", { state: "visible" });
  await page.waitForFunction(() => typeof window.__release === "function");
  await page.click("#poster-stage-reading >> text=CANCEL");
  await page.evaluate(() => window.__release());
  await settle(300);
  assert.equal(await page.evaluate(() => document.getElementById("modal-poster").classList.contains("open")), false, "still closed after the late answer");
  assert.equal(await page.evaluate(() => tourneys.length), before);
  ok("cancelling while Claude is reading closes it, and the late answer is ignored");

  // 11. no Claude access: says how to get it, READ stays off
  await page.evaluate(() => { window.__savedUid = window.__pokerhqAuthUid; window.__pokerhqAuthUid = ""; });
  await page.click("#cal-poster-btn");
  assert.match(await text("#poster-error"), /needs Claude\. Add your Anthropic API key in AI Assistant/);
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  assert.equal(await page.isDisabled("#poster-read-btn"), true);
  await page.evaluate(() => { closePosterImport(); window.__pokerhqAuthUid = window.__savedUid; });
  ok("without Claude access it says how to set it up and READ POSTER stays off");

  // 12. Privacy Mode: the confirm screen shows no readable amounts
  await page.evaluate(() => { window.__aiMode = "ok"; window.callAnthropicMessages = async () => ({ ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify(window.__aiFixture) }] }) }); PokerHQPrivacy.setManual(true); });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  await page.locator('.poster-card:has([data-field="name"] input[value="APT High Roller"]) [data-field="rate"] input').fill("58.4");
  const leaks = await page.evaluate(() => {
    const found = [];
    const w = document.createTreeWalker(document.getElementById("modal-poster"), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (PokerHQPrivacy.hasMoney(n.nodeValue)) found.push(n.nodeValue.trim());
    document.querySelectorAll("#modal-poster [data-money]").forEach((el) => { if (el.value && getComputedStyle(el).webkitTextFillColor !== "rgba(0, 0, 0, 0)") found.push("box readable: " + el.value); });
    return found;
  });
  assert.deepEqual(leaks, [], "amounts readable on the confirm screen with Privacy Mode on");
  await page.evaluate(() => { PokerHQPrivacy.setManual(false); closePosterImport(); });
  ok("with Privacy Mode on, the confirm screen's buy-in boxes are blurred and the peso preview is masked");

  // 13. phone layout
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#cal-poster-btn");
  await page.setInputFiles("#poster-file", { name: "poster.png", mimeType: "image/png", buffer: photoBuffer });
  await page.waitForFunction(() => !document.getElementById("poster-read-btn").disabled);
  await page.click("#poster-read-btn");
  await page.waitForSelector("#poster-stage-confirm", { state: "visible" });
  const phone = await page.evaluate(() => { const modal = document.querySelector("#modal-poster .modal"); const r = modal.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth - innerWidth, modalRight: Math.round(r.right), inner: modal.scrollWidth - modal.clientWidth, cards: [...document.querySelectorAll(".poster-card")].map((c) => Math.round(c.getBoundingClientRect().right)) }; });
  assert.ok(phone.overflow <= 0 && phone.modalRight <= 390 && phone.inner <= 0 && phone.cards.every((r) => r <= 390), JSON.stringify(phone));
  await page.evaluate(() => closePosterImport());
  ok("phone: the pop-up and its cards fit, no sideways scroll");

  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
