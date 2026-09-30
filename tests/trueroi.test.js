"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../js/data/trueroi.js");

const trip = (over) => Object.assign({ id: 1, name: "APT Taipei", start: "2026-04-20", end: "2026-04-30", rates: {} }, over || {});
const sess = (over) => Object.assign({ id: 1, name: "Main Event", date: "2026-04-25", total: 0, prize: 0, bounties: 0 }, over || {});
const sat = (over) => Object.assign({ id: 1, name: "Daily Satellite", date: "2026-03-14", buyin: 1100, result: "lost" }, over || {});
const exp = (over) => Object.assign({ id: 1, tripId: 1, date: "2026-04-21", category: "hotel", description: "", amount: 1000, currency: "PHP" }, over || {});

test("a cost in pesos is itself; a foreign cost is amount x rate; one with no rate is not counted yet", () => {
  assert.deepEqual(T.expensePhp(exp({ amount: 3500.456 })), { php: 3500.46, converted: true });
  assert.deepEqual(T.expensePhp(exp({ amount: 420, currency: "USD", rate: 58.2 })), { php: 24444, converted: true });
  assert.deepEqual(T.expensePhp(exp({ amount: 1.5, currency: "usd", rate: 58.333 })), { php: 87.5, converted: true }, "lower case codes are fine");
  assert.deepEqual(T.expensePhp(exp({ amount: 420, currency: "USD" })), { php: 0, converted: false });
  assert.deepEqual(T.expensePhp(exp({ amount: 420, currency: "USD", rate: 0 })), { php: 0, converted: false });
  assert.deepEqual(T.expensePhp(exp({ amount: 420, currency: "USD", rate: -3 })), { php: 0, converted: false });
  assert.deepEqual(T.expensePhp(exp({ amount: 5, currency: "PHP", rate: 99 })), { php: 5, converted: true }, "a rate on a peso cost is ignored");
  assert.deepEqual(T.expensePhp(exp({ amount: 5, currency: undefined })), { php: 5, converted: true }, "no currency means pesos");
  assert.deepEqual(T.expensePhp(null), { php: 0, converted: true });
  assert.deepEqual(T.expensePhp({ amount: "abc" }), { php: 0, converted: true });
});

test("the cost form: what is accepted and what is refused, in plain words", () => {
  const ok = T.normalizeExpense({ id: 9, tripId: 1, date: "2026-04-21", category: "flight", description: "  MNL   to TPE ", amount: "18500", currency: "php" });
  assert.deepEqual(ok, { ok: true, expense: { id: 9, tripId: 1, date: "2026-04-21", category: "flight", description: "MNL to TPE", amount: 18500, currency: "PHP" } });
  const foreign = T.normalizeExpense({ tripId: 1, date: "2026-04-21", category: "hotel", amount: 420.005, currency: "USD", rate: "58.123456" });
  assert.equal(foreign.ok, true);
  assert.equal(foreign.expense.rate, 58.1235, "the rate is kept to 4 decimals");
  assert.equal(foreign.expense.amount, 420.01);
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-04-21", amount: 420, currency: "USD" }).message, "Enter the exchange rate: how many pesos one USD is worth.");
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-04-21", amount: 0 }).message, "Enter an amount above zero.");
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-04-21", amount: -5 }).ok, false);
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-04-21", amount: 5, currency: "XYZ" }).message, "That currency is not in the list.");
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-02-30", amount: 5 }).message, "Pick the date you paid.");
  assert.equal(T.normalizeExpense({ tripId: 1, date: "", amount: 5 }).ok, false);
  assert.equal(T.normalizeExpense({ date: "2026-04-21", amount: 5 }).message, "Pick the trip this cost belongs to.");
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-04-21", amount: 5, category: "bogus" }).expense.category, "other");
  assert.equal(T.normalizeExpense({ tripId: 1, date: "2026-04-21", amount: 5, description: "x".repeat(200) }).expense.description.length, 80);
  assert.equal(T.normalizeExpense().ok, false);
});

test("the trip form", () => {
  const ok = T.normalizeTrip({ id: 3, name: "  APT   Taipei 2026 ", start: "2026-04-20", end: "2026-04-30", notes: " Flight + 9 nights ", rates: { usd: "58.2", TWD: 1.85, PHP: 1, XXX: 5, EUR: -1, JPY: 0 } });
  assert.deepEqual(ok, { ok: true, trip: { id: 3, name: "APT Taipei 2026", start: "2026-04-20", end: "2026-04-30", notes: "Flight + 9 nights", rates: { USD: 58.2, TWD: 1.85 } } });
  assert.equal(T.normalizeTrip({ name: "", start: "2026-04-20", end: "2026-04-30" }).message, "Give the trip a name.");
  assert.equal(T.normalizeTrip({ name: "x", start: "2026-04-20" }).message, "Pick the first and last day of the trip.");
  assert.equal(T.normalizeTrip({ name: "x", start: "2026-04-30", end: "2026-04-20" }).message, "The last day is before the first day.");
  assert.equal(T.normalizeTrip({ name: "x", start: "2026-04-20", end: "2026-04-20" }).ok, true, "a one-day trip is a trip");
  assert.equal(T.normalizeTrip({ name: "n".repeat(100), start: "2026-04-20", end: "2026-04-21" }).trip.name.length, 60);
});

test("the suggested exchange rate: the trip's own, else the newest trip that has one", () => {
  const a = trip({ id: 1, start: "2025-04-20", end: "2025-04-25", rates: { USD: 56 } });
  const b = trip({ id: 2, start: "2026-04-20", end: "2026-04-25", rates: { USD: 58.2, TWD: 1.8 } });
  const c = trip({ id: 3, start: "2026-09-01", end: "2026-09-05", rates: {} });
  assert.equal(T.defaultRate(b, "USD", [a, b, c]), 58.2);
  assert.equal(T.defaultRate(c, "USD", [a, b, c]), 58.2, "the newest other trip with a USD rate");
  assert.equal(T.defaultRate(c, "TWD", [a, b, c]), 1.8);
  assert.equal(T.defaultRate(c, "THB", [a, b, c]), null);
  assert.equal(T.defaultRate(c, "PHP", [a, b, c]), null, "pesos need no rate");
  assert.equal(T.defaultRate(c, "nope", [a, b, c]), null);
});

test("which trip a session or satellite belongs to: chosen, none, or by date", () => {
  const a = trip({ id: 1, start: "2026-04-20", end: "2026-04-30" });
  const b = trip({ id: 2, name: "Macau", start: "2026-06-10", end: "2026-06-14" });
  const trips = [a, b];
  assert.equal(T.tripFor(sess({ date: "2026-04-25" }), trips), a, "by date");
  assert.equal(T.tripFor(sess({ date: "2026-04-20" }), trips), a, "first day counts");
  assert.equal(T.tripFor(sess({ date: "2026-04-30" }), trips), a, "last day counts");
  assert.equal(T.tripFor(sess({ date: "2026-05-01" }), trips), null, "outside every trip");
  assert.equal(T.tripFor(sess({ date: "2026-04-25", tripId: 2 }), trips), b, "an explicit choice wins over the date");
  assert.equal(T.tripFor(sess({ date: "2026-05-15", tripId: 2 }), trips), b, "a satellite played weeks before the trip, assigned to it");
  assert.equal(T.tripFor(sess({ date: "2026-04-25", tripId: "none" }), trips), null, "'none' keeps it off every trip");
  assert.equal(T.tripFor(sess({ date: "2026-04-25", tripId: 999 }), trips), a, "a deleted trip falls back to the date");
  assert.equal(T.tripFor(sess({ date: "2026-05-15", tripId: 999 }), trips), null);
  assert.equal(T.tripFor(sess({ date: "not a date" }), trips), null);
  assert.equal(T.tripFor(sess({ date: "2026-04-25T10:00:00" }), trips), a, "a time on the date is ignored");
  assert.equal(T.tripFor(null, trips), null);
  assert.equal(T.tripFor(sess(), null), null);
  const overlap = [trip({ id: 5, start: "2026-04-01", end: "2026-04-30" }), trip({ id: 6, start: "2026-04-24", end: "2026-04-28" })];
  assert.equal(T.tripFor(sess({ date: "2026-04-25" }), overlap).id, 6, "overlapping trips: the one that started last is the more specific");
});

test("worked example: poker ROI vs true ROI for a trip", () => {
  // 2 cash events (₱10,000 + ₱10,000 in, ₱30,000 back), plus ₱6,000 hotel, ₱4,000 flights and USD 100 at 58 of food
  const s = T.summarize({
    sessions: [sess({ total: 10000, prize: 30000 }), sess({ id: 2, total: 10000, prize: 0 })],
    satellites: [],
    expenses: [exp({ amount: 6000, category: "hotel" }), exp({ id: 2, amount: 4000, category: "flight" }), exp({ id: 3, amount: 100, currency: "USD", rate: 58, category: "food" })],
  });
  assert.equal(s.pokerInvested, 20000);
  assert.equal(s.returned, 30000);
  assert.equal(s.pokerPnl, 10000);
  assert.equal(s.pokerRoi, 50, "poker ROI: +50%");
  assert.equal(s.expenses, 15800);
  assert.equal(s.trueCost, 35800);
  assert.equal(s.truePnl, -5800);
  assert.equal(s.trueRoi, -16.2, "true ROI: -16.2%: the trip cost more than the profit");
  assert.deepEqual(s.byCategory.map((c) => [c.id, c.php]), [["hotel", 6000], ["flight", 4000], ["food", 5800]].sort((a, b) => b[1] - a[1]));
  assert.deepEqual(s.warnings, []);
  assert.equal(s.sessions, 2);
  assert.equal(s.expenseCount, 3);
});

test("bounties count as winnings for both ROIs", () => {
  const s = T.summarize({ sessions: [sess({ total: 5000, prize: 0, bounties: 2500 })], expenses: [exp({ amount: 2500 })] });
  assert.equal(s.returned, 2500);
  assert.equal(s.pokerRoi, -50);
  assert.equal(s.trueRoi, -66.7, "₱2,500 back on ₱7,500 spent");
});

test("SATELLITES: a seat won in a satellite is counted once, through the satellites, never as a cash buy-in as well", () => {
  // three ₱1,100 satellites (two lost, one won the seat) and the ₱6,500 Main Event played on that seat, which paid ₱20,000
  const satellites = [sat({ id: 1, result: "lost" }), sat({ id: 2, result: "lost" }), sat({ id: 3, result: "won" })];
  const seatSession = sess({ id: 9, total: 6500, prize: 20000, seatViaSatellite: true });
  const s = T.summarize({ sessions: [seatSession], satellites, expenses: [] });
  assert.equal(s.satelliteSpend, 3300);
  assert.equal(s.cashBuyins, 0, "the seat was not paid for in cash");
  assert.equal(s.trueCost, 3300, "it cost what the satellites cost");
  assert.equal(s.truePnl, 16700);
  assert.equal(s.trueRoi, 506.1);
  assert.equal(s.pokerInvested, 6500, "poker ROI still uses the buy-in you logged");
  assert.equal(s.pokerRoi, 207.7);
  // the same session NOT marked would count 6,500 + 3,300 = 9,800: the double count this guards against
  const naive = T.summarize({ sessions: [Object.assign({}, seatSession, { seatViaSatellite: false })], satellites, expenses: [] });
  assert.equal(naive.trueCost, 9800);
  assert.notEqual(naive.trueCost, s.trueCost);
  assert.equal(T.sessionCash(seatSession), 0);
  assert.equal(T.sessionCash(sess({ total: 4000 })), 4000);
  assert.equal(T.sessionCash(null), 0);
});

test("a seat session with no satellites logged warns that its entry cost is zero", () => {
  const s = T.summarize({ sessions: [sess({ total: 6500, prize: 0, seatViaSatellite: true })], satellites: [], expenses: [] });
  assert.equal(s.trueCost, 0);
  assert.equal(s.trueRoi, null, "no cost, no ROI");
  assert.equal(s.warnings.length, 1);
  assert.equal(s.warnings[0].code, "seat-no-satellites");
  assert.match(s.warnings[0].text, /1 session is marked as a satellite seat.*entry cost is ₱0/);
  assert.equal(T.summarize({ sessions: [sess({ seatViaSatellite: true }), sess({ id: 2, seatViaSatellite: true })] }).warnings[0].text.startsWith("2 sessions are marked"), true);
});

test("a satellite that is also logged as a session is flagged as a possible double count", () => {
  const satellites = [sat({ id: 1, name: "Okada Daily Satellite", date: "2026-03-14", buyin: 1100 })];
  const sessions = [
    sess({ id: 1, name: "Okada Daily Satellite", date: "2026-03-14", total: 1100 }),   // the same one
    sess({ id: 2, name: "Okada Daily Satellite", date: "2026-03-15", total: 1100 }),   // another day
    sess({ id: 3, name: "Okada Daily Satellite", date: "2026-03-14", total: 2200 }),   // another buy-in
    sess({ id: 4, name: "Something else", date: "2026-03-14", total: 1100 }),          // another game
    sess({ id: 5, name: "Okada Daily Satellite", date: "2026-03-14", total: 1100, seatViaSatellite: true }),   // a seat session is not the satellite
  ];
  const pairs = T.possibleDuplicates(sessions, satellites);
  assert.deepEqual(pairs.map((p) => [p.satelliteId, p.sessionId]), [[1, 1]]);
  const s = T.summarize({ sessions, satellites });
  const w = s.warnings.filter((x) => x.code === "possible-double-count");
  assert.equal(w.length, 1);
  assert.match(w[0].text, /"Okada Daily Satellite" on 2026-03-14 is in both your satellites and your sessions/);
  assert.deepEqual(T.possibleDuplicates(null, null), []);
});

test("a cost with no exchange rate is left out and flagged, and counts once a rate is added", () => {
  const list = [exp({ amount: 1000 }), exp({ id: 2, amount: 200, currency: "USD" })];
  const s = T.summarize({ expenses: list });
  assert.equal(s.expenses, 1000);
  assert.equal(s.unconverted, 1);
  assert.equal(s.warnings[0].code, "unconverted");
  assert.match(s.warnings[0].text, /^1 cost has no exchange rate, so it is not counted yet\.$/);
  list[1].rate = 58;
  const fixed = T.summarize({ expenses: list });
  assert.equal(fixed.expenses, 12600);
  assert.equal(fixed.unconverted, 0);
  assert.deepEqual(fixed.warnings, []);
});

test("empty and odd input never throws", () => {
  const empty = T.summarize();
  assert.equal(empty.trueCost, 0);
  assert.equal(empty.pokerRoi, null);
  assert.equal(empty.trueRoi, null);
  assert.deepEqual(empty.byCategory, []);
  assert.equal(T.summarize({ sessions: [null, { total: "x" }], satellites: [undefined, { buyin: "nope" }], expenses: [null, {}] }).trueCost, 0);
  const p = T.partition();
  assert.deepEqual(p.trips, []);
  assert.equal(p.overall.trueCost, 0);
});

test("sorting into trips: every session, satellite and cost lands in exactly one place, and the pieces add up to the total", () => {
  const trips = [trip({ id: 1, name: "Taipei", start: "2026-04-20", end: "2026-04-30" }), trip({ id: 2, name: "Macau", start: "2026-06-10", end: "2026-06-14" })];
  const input = {
    trips,
    sessions: [
      sess({ id: 1, date: "2026-04-25", total: 10000, prize: 25000 }),
      sess({ id: 2, date: "2026-04-26", total: 6500, prize: 0, seatViaSatellite: true }),
      sess({ id: 3, date: "2026-06-11", total: 5000, prize: 0 }),
      sess({ id: 4, date: "2026-05-05", total: 3000, prize: 1000 }),                      // on no trip
      sess({ id: 5, date: "2026-05-06", total: 2000, prize: 0, tripId: 2 }),              // put on Macau by hand
      sess({ id: 6, date: "2026-04-27", total: 1500, prize: 0, tripId: "none" }),         // kept off Taipei
    ],
    satellites: [
      sat({ id: 1, date: "2026-03-14", buyin: 1100, tripId: 1 }),   // played in March for the Taipei seat
      sat({ id: 2, date: "2026-03-20", buyin: 1100, tripId: 1 }),
      sat({ id: 3, date: "2026-06-09", buyin: 550 }),                // no trip chosen and outside both
      sat({ id: 4, date: "2026-06-12", buyin: 700 }),                // during Macau
    ],
    expenses: [exp({ id: 1, tripId: 1, amount: 18500 }), exp({ id: 2, tripId: 2, amount: 100, currency: "USD", rate: 58 }), exp({ id: 3, tripId: 999, amount: 700 })],   // 999: its trip was deleted
  };
  const p = T.partition(input);
  assert.deepEqual(p.trips.map((t) => t.trip.name), ["Macau", "Taipei"], "newest trip first");
  const taipei = p.trips.find((t) => t.trip.id === 1).summary;
  const macau = p.trips.find((t) => t.trip.id === 2).summary;
  assert.equal(taipei.sessions, 2);
  assert.equal(taipei.satellites, 2, "the March satellites chosen for the trip");
  assert.equal(taipei.satelliteSpend, 2200);
  assert.equal(taipei.cashBuyins, 10000, "the seat session is not cash");
  assert.equal(taipei.expenses, 18500);
  assert.equal(taipei.trueCost, 30700);
  assert.equal(macau.sessions, 2, "one by date, one put there by hand");
  assert.equal(macau.satellites, 1);
  assert.equal(macau.expenses, 5800);
  assert.equal(p.unassigned.sessions, 2);
  assert.equal(p.unassigned.satellites, 1);
  assert.equal(p.unassigned.expenses, 700, "a cost whose trip was deleted is kept, on 'no trip'");
  // nothing lost, nothing counted twice
  const parts = [taipei, macau, p.unassigned];
  const sum = (k) => Math.round(parts.reduce((n, x) => n + x[k], 0) * 100) / 100;
  ["sessions", "satellites", "pokerInvested", "returned", "cashBuyins", "satelliteSpend", "expenses", "trueCost"].forEach((k) => assert.equal(sum(k), p.overall[k], k));
  assert.equal(p.overall.sessions, 6);
  assert.equal(p.overall.satellites, 4);
  assert.equal(p.overall.trueCost, 10000 + 5000 + 3000 + 2000 + 1500 + 3450 + 18500 + 5800 + 700);
});

test("the wording of money and ROI", () => {
  assert.equal(T.formatPeso(24444), "₱24,444");
  assert.equal(T.formatPeso(-1500.6), "−₱1,501");
  assert.equal(T.formatPeso(0), "₱0");
  assert.equal(T.formatAmount(420, "USD"), "USD 420");
  assert.equal(T.formatAmount(1234.5, "USD"), "USD 1,234.5");
  assert.equal(T.formatAmount(1234567, "VND"), "VND 1,234,567");
  assert.equal(T.formatAmount(3500, "PHP"), "₱3,500");
  assert.equal(T.describeExpense(exp({ amount: 420, currency: "USD", rate: 58.2 })), "USD 420 × 58.2 = ₱24,444");
  assert.equal(T.describeExpense(exp({ amount: 3500 })), "₱3,500");
  assert.equal(T.describeExpense(exp({ amount: 420, currency: "USD" })), "USD 420 · needs a rate");
  assert.equal(T.formatRoi(12.34), "+12.3%");
  assert.equal(T.formatRoi(-16.2), "−16.2%");
  assert.equal(T.formatRoi(0), "0.0%");
  assert.equal(T.formatRoi(null), "—");
  assert.equal(T.formatRoi(undefined), "—");
});

test("the currency and category lists", () => {
  assert.equal(T.CURRENCIES[0].code, "PHP", "pesos first");
  assert.equal(new Set(T.CURRENCIES.map((c) => c.code)).size, T.CURRENCIES.length);
  T.CURRENCIES.forEach((c) => assert.match(c.code, /^[A-Z]{3}$/));
  assert.equal(T.currencyCode("usd"), "USD");
  assert.equal(T.currencyCode(""), "PHP");
  assert.equal(T.currencyCode("nope"), null);
  assert.equal(new Set(T.CATEGORIES.map((c) => c.id)).size, T.CATEGORIES.length);
  assert.ok(T.categoryById("other") && T.categoryById("flight"));
  assert.equal(T.categoryById("nope"), null);
});

test("the two new lists are wired into sync, the JSON backup, the weekly backup, the size guard and the demo", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  ["trips", "tripExpenses"].forEach((k) => {
    assert.match(read("js/data/config.js"), new RegExp('"' + k + '"'), k + " is a synced key");
    assert.match(read("js/data/sync.js"), new RegExp('"' + k + '"'), k + " is merged record by record and applied on load");
    assert.match(read("functions/backup.js"), new RegExp(k + ":"), k + " is in the weekly server backup");
    assert.match(read("js/features/library.js"), new RegExp("persist\\('" + k + "'"), k + " is restored from a JSON backup");
    assert.match(read("js/features/library.js"), new RegExp(k + ": cloneBackupValue"), k + " is written to a JSON backup");
    assert.match(read("js/features/active-session.js"), new RegExp(k + ": window\\." + k), k + " is watched by the cloud size guard");
    assert.match(read("js/features/demo-mode.js"), new RegExp("window\\." + k + " = "), k + " is swapped in and out with the demo");
    assert.match(read("index.html"), new RegExp("window\\." + k + " = load\\('" + k + "'"), k + " is loaded at start");
  });
  assert.match(read("js/data/backup-format.js"), /"trips", "tripExpenses"/, "the backup reader keeps both lists");
  // the merge list in sync.js includes them (they are lists of records with ids)
  assert.match(read("js/data/sync.js"), /MERGE_KEYS = \[[^\]]*"trips", "tripExpenses"[^\]]*\]/);
});

test("the pieces are wired up: scripts, offline cache, Treasury section, pop-ups, session and satellite fields", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const html = read("index.html");
  assert.match(html, /<script src="\.\/js\/data\/trueroi\.js\?v=\w+"><\/script>/);
  assert.match(html, /<script src="\.\/js\/features\/trips\.js\?v=\w+"><\/script>/);
  assert.ok(html.indexOf("js/data/trueroi.js") < html.indexOf("js/features/trips.js"));
  assert.match(read("sw.js"), /\.\/js\/data\/trueroi\.js/);
  assert.match(read("sw.js"), /\.\/js\/features\/trips\.js/);
  ["trips-section", "trips-list", "trips-overall", "modal-trip", "modal-trip-cost", "cost-amount", "cost-currency", "cost-rate", "s-trip", "s-satseat", "sat-trip"].forEach((id) => assert.match(html, new RegExp('id="' + id + '"'), id));
  assert.match(html, /id="cost-amount"[^>]*data-money/, "the amount box is blurred by Privacy Mode");
  assert.match(read("js/features/treasury.js"), /renderTrips\(\)/, "Treasury draws the section");
  const idx = html;
  assert.match(idx, /applySessionTripFields\(s\)/);
  assert.match(idx, /applySessionTripFields\(existing\)/);
  assert.match(idx, /loadSessionTripFields\(s\)/);
  assert.match(read("js/features/library.js"), /applySatelliteTripField\(s\)/);
  // every currency in the cost form is a currency the maths knows, and the other way round
  const optionCodes = [...html.matchAll(/<option value="([A-Z]{3})">\1 · /g)].map((m) => m[1]).sort();
  assert.deepEqual(optionCodes, T.CURRENCIES.map((c) => c.code).sort());
});

test("a trip with costs but no sessions yet has no ROI, rather than a scary -100%", () => {
  const planned = T.summarize({ sessions: [], satellites: [], expenses: [exp({ amount: 82591 })] });
  assert.equal(planned.trueCost, 82591);
  assert.equal(planned.trueRoi, null);
  assert.equal(planned.pokerRoi, null);
  assert.equal(planned.truePnl, -82591, "the money is still counted as spent");
  assert.equal(T.summarize({ sessions: [sess({ total: 1000 })], expenses: [exp({ amount: 82591 })] }).trueRoi !== null, true, "one session and the ROI appears");
});
