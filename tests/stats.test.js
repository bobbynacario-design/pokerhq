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
