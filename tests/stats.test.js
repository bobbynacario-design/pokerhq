"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../js/data/stats.js");

const sess = (o) => Object.assign({date: "2026-01-04", venue: "Metro", total: 1000, prize: 0, pnl: -1000, hours: 0, result: "bust"}, o);

test("weekday index is Monday-first and uses the written calendar date", () => {
  assert.equal(S.weekdayIndex("2026-01-01"), 3);   // Thursday
  assert.equal(S.weekdayIndex("2026-01-04"), 6);   // Sunday
  assert.equal(S.weekdayIndex("2026-01-05"), 0);   // Monday
  assert.equal(S.weekdayIndex("2026-01-04T23:30:00"), 6, "time suffix ignored");
  assert.equal(S.weekdayIndex("2026-02-30"), null, "impossible date");
  assert.equal(S.weekdayIndex("Jan 4"), null);
  assert.equal(S.weekdayIndex(""), null);
  assert.equal(S.weekdayIndex(undefined), null);
});

test("byWeekday: Mon→Sun order, only days played, sessions with bad dates skipped", () => {
  const rows = S.byWeekday([
    sess({date: "2026-01-04"}),                 // Sun
    sess({date: "2026-01-05"}),                 // Mon
    sess({date: "2026-01-11"}),                 // Sun
    sess({date: "nonsense"}),
  ]);
  assert.deepEqual(rows.map((r) => r.label), ["Mon", "Sun"]);
  assert.deepEqual(rows.map((r) => r.count), [1, 2]);
});

test("summarize: ITM %, ROI and P&L", () => {
  const r = S.summarize("x", [
    sess({total: 1000, prize: 0, result: "bust"}),
    sess({total: 1000, prize: 3000, result: "itm"}),
    sess({total: 2000, prize: 10000, result: "final"}),
    sess({total: 1000, prize: 0, result: "bust"}),
  ]);
  assert.equal(r.count, 4);
  assert.equal(r.itmPct, 50);
  assert.equal(r.invested, 5000);
  assert.equal(r.pnl, 8000);
  assert.equal(r.roi, 160);
  assert.equal(r.lowSample, false);
});

test("summarize: ₱/hr only counts sessions that logged hours", () => {
  const r = S.summarize("x", [
    sess({pnl: 1000, hours: 4}),
    sess({pnl: -500, hours: 1}),
    sess({pnl: 90000, hours: 0}),     // no hours logged: must not inflate the rate
  ]);
  assert.equal(r.perHour, 100);        // (1000 - 500) / 5h
  assert.equal(S.summarize("x", [sess({hours: 0})]).perHour, null);
});

test("summarize: low sample flag and empty list", () => {
  assert.equal(S.summarize("x", [sess({}), sess({})]).lowSample, true);
  assert.equal(S.summarize("x", [sess({}), sess({}), sess({})]).lowSample, false);
  const e = S.summarize("x", []);
  assert.equal(e.count, 0); assert.equal(e.roi, 0); assert.equal(e.itmPct, 0); assert.equal(e.perHour, null);
});

test("byVenue groups case-insensitively, labels with the most-used spelling, busiest first", () => {
  const rows = S.byVenue([
    sess({venue: "Metro Card Club"}), sess({venue: "metro card club"}), sess({venue: "Metro Card Club "}),
    sess({venue: "Okada"}),
    sess({venue: ""}), sess({venue: undefined}),
  ]);
  assert.equal(rows[0].label, "Metro Card Club");
  assert.equal(rows[0].count, 3);
  assert.deepEqual(rows.map((r) => r.count), [3, 2, 1]);
  assert.ok(rows.some((r) => r.label === "(no venue)" && r.count === 2));
});

test("byVenue: ties broken by P&L; extra venues roll into one 'All other' row that adds up", () => {
  const list = [];
  for (let i = 0; i < 6; i++) list.push(sess({venue: "Venue " + i, pnl: -100 * i, total: 1000, prize: 1000 - 100 * i}));
  const rows = S.byVenue(list, 4);
  assert.equal(rows.length, 4);
  assert.match(rows[3].label, /^All other venues \(3\)$/);
  assert.equal(rows[3].count, 3);
  assert.equal(rows.reduce((n, r) => n + r.count, 0), 6, "nothing lost in the roll-up");
  assert.equal(rows[0].label, "Venue 0", "best P&L first among equal counts");
});

test("byVenue / byWeekday tolerate empty and junk input", () => {
  assert.deepEqual(S.byVenue([]), []);
  assert.deepEqual(S.byVenue(null), []);
  assert.deepEqual(S.byWeekday(undefined), []);
  assert.doesNotThrow(() => S.byVenue([null, undefined, {}]));
  assert.doesNotThrow(() => S.byWeekday([null, {}]));
});

test("bounties count as returns in venue/weekday ROI and P&L", () => {
  const r = S.summarize("x", [
    sess({total: 3000, prize: 0, bounties: 1500, result: "bust"}),
    sess({total: 3000, prize: 6000, bounties: 1000, result: "itm"}),
  ]);
  assert.equal(r.invested, 6000);
  assert.equal(r.pnl, 2500);               // (0+1500) + (6000+1000) - 6000
  assert.equal(r.roi, 41.7);
  assert.equal(r.itmPct, 50, "bounty-only session is not ITM");
});

// ── by month ──
test("monthKey reads the month as written and rejects nonsense", () => {
  assert.equal(S.monthKey("2026-09-27"), "2026-09");
  assert.equal(S.monthKey("2026-01-01T23:59:00"), "2026-01");
  assert.equal(S.monthKey("2026-13-01"), null);
  assert.equal(S.monthKey("2026-00-10"), null);
  assert.equal(S.monthKey("Sep 2026"), null);
  assert.equal(S.monthKey(undefined), null);
});

test("byMonth: newest first, grouped by month, bad dates skipped, limit applied", () => {
  const list = [
    sess({date: "2026-01-04", pnl: 100}), sess({date: "2026-01-20", pnl: 200}),
    sess({date: "2026-03-02"}), sess({date: "2025-12-31"}), sess({date: "garbage"}),
  ];
  const rows = S.byMonth(list);
  assert.deepEqual(rows.map((r) => r.key), ["2026-03", "2026-01", "2025-12"]);
  assert.deepEqual(rows.map((r) => r.label), ["Mar 2026", "Jan 2026", "Dec 2025"]);
  assert.deepEqual(rows.map((r) => r.count), [1, 2, 1]);
  assert.deepEqual(S.byMonth(list, 2).map((r) => r.key), ["2026-03", "2026-01"]);
  assert.deepEqual(S.byMonth([]), []);
  assert.deepEqual(S.byMonth(null), []);
});

test("byMonth rows carry returned + hours, and bounties count as returns", () => {
  const rows = S.byMonth([
    sess({date: "2026-02-01", total: 3000, prize: 0, bounties: 1200, hours: 5, pnl: -1800}),
    sess({date: "2026-02-08", total: 3000, prize: 9000, hours: 3, pnl: 6000, result: "itm"}),
  ]);
  assert.equal(rows[0].returned, 10200);
  assert.equal(rows[0].hours, 8);
  assert.equal(rows[0].pnl, 4200);
});

test("monthlyCsv: oldest first, exact totals, escaping", () => {
  const rows = S.byMonth([
    sess({date: "2026-01-04", total: 1000, prize: 3000, pnl: 2000, hours: 4, result: "itm"}),
    sess({date: "2026-02-01", total: 2000, prize: 0, pnl: -2000, hours: 6}),
    sess({date: "2026-02-08", total: 1000, prize: 0, pnl: -1000, hours: 0}),
  ]);
  const lines = S.monthlyCsv(rows).trimEnd().split("\n");
  assert.equal(lines[0], "Month,Sessions,ITM %,Invested,Returned,P&L,ROI %,Hours,P&L per hour");
  assert.equal(lines[1], "2026-01,1,100,1000,3000,2000,200,4,500");
  assert.equal(lines[2], "2026-02,2,0,3000,0,-3000,-100,6,-333");
  // ₱/hr uses only sessions with hours: (+2000 in 4h) + (-2000 in 6h) over 10h = 0
  assert.equal(lines[3], "Total,3,33,4000,3000,-1000,-25,10,0");
  assert.equal(S.monthlyCsv([]).trimEnd(), "Month,Sessions,ITM %,Invested,Returned,P&L,ROI %,Hours,P&L per hour");
});

// ── by format ──
test("byStructure groups by format, real formats first, 'Not recorded' last", () => {
  const rows = S.byStructure([
    sess({structure: "Turbo", pnl: 500}), sess({structure: "Turbo", pnl: -100}), sess({structure: "Turbo"}),
    sess({structure: "Freezeout"}),
    sess({}), sess({structure: ""}), sess({structure: "  "}), sess({structure: undefined}), sess({structure: null}),
  ]);
  assert.deepEqual(rows.map((r) => r.label), ["Turbo", "Freezeout", "Not recorded"]);
  assert.deepEqual(rows.map((r) => r.count), [3, 1, 5]);
  assert.deepEqual(S.byStructure([]), []);
  assert.deepEqual(S.byStructure(null), []);
  assert.doesNotThrow(() => S.byStructure([null, undefined, {}]));
});

test("byStructure: 'Not recorded' stays last even when it has the most sessions", () => {
  const rows = S.byStructure([sess({}), sess({}), sess({}), sess({structure: "PKO"})]);
  assert.equal(rows[rows.length - 1].label, "Not recorded");
  assert.equal(rows[0].label, "PKO");
});

// ── venue filter (calendar) ──
const evt = (venue, extra) => Object.assign({id: Math.random(), name: "E", venue}, extra || {});

test("venueKey ignores case and spacing; empty is its own bucket", () => {
  assert.equal(S.venueKey("Metro Card Club"), S.venueKey("  metro   card club "));
  assert.notEqual(S.venueKey("Metro Card Club"), S.venueKey("Okada"));
  assert.equal(S.venueKey(""), S.NO_VENUE);
  assert.equal(S.venueKey(undefined), S.NO_VENUE);
  assert.equal(S.venueKey("   "), S.NO_VENUE);
});

test("venueChoices: counts, most-used spelling, busiest first then A–Z, '(no venue)' last", () => {
  const choices = S.venueChoices([
    evt("Metro Card Club"), evt("metro card club"), evt("Metro Card Club"),
    evt("Okada Manila"), evt("Okada Manila"),
    evt("Solaire"), evt("City of Dreams"),
    evt(""), evt(undefined), evt("  "),
  ]);
  assert.deepEqual(choices.map((c) => c.label), ["Metro Card Club", "Okada Manila", "City of Dreams", "Solaire", "(no venue)"]);
  assert.deepEqual(choices.map((c) => c.count), [3, 2, 1, 1, 3]);
  assert.equal(choices[choices.length - 1].key, S.NO_VENUE, "no-venue last even though it has 3 events");
  assert.deepEqual(S.venueChoices([]), []);
  assert.deepEqual(S.venueChoices(null), []);
  assert.doesNotThrow(() => S.venueChoices([null, undefined, {}]));
});

test("filterByVenue: all, one venue (any spelling), no venue, unknown venue", () => {
  const list = [evt("Metro Card Club", {id: 1}), evt("METRO CARD CLUB ", {id: 2}), evt("Okada", {id: 3}), evt("", {id: 4})];
  assert.deepEqual(S.filterByVenue(list, "").map((e) => e.id), [1, 2, 3, 4]);
  assert.deepEqual(S.filterByVenue(list, null).map((e) => e.id), [1, 2, 3, 4]);
  assert.deepEqual(S.filterByVenue(list, S.venueKey("metro card club")).map((e) => e.id), [1, 2]);
  assert.deepEqual(S.filterByVenue(list, S.NO_VENUE).map((e) => e.id), [4]);
  assert.deepEqual(S.filterByVenue(list, "atlantis"), []);
  assert.deepEqual(S.filterByVenue(null, "x"), []);
});
