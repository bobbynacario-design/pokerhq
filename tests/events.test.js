"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../functions/events.js");

// day-granular comparison the reminder job relies on
const ymd = (t) => { const s = E.parseStart(t); return s ? E.manilaYMD(s) : null; };

test("parseStart: every date shape the calendar stores", () => {
  assert.equal(ymd({date: "2026-10-03"}), "2026-10-03");
  assert.equal(ymd({date: "2026-10-03T19:00:00"}), "2026-10-03");
  assert.equal(ymd({date: "March 22-24, 2026"}), "2026-03-22");
  assert.equal(ymd({date: "March 22 - April 2, 2026"}), "2026-03-22");
  assert.equal(ymd({date: "Sep 5-8, 2026"}), "2026-09-05");
  assert.equal(ymd({date: "October 3, 2026"}), "2026-10-03");
  assert.equal(ymd({date: "Oct 3 2026"}), "2026-10-03");
  const year = new Date().getFullYear();
  assert.equal(ymd({day: "7", month: "NOV"}), year + "-11-07");
});

test("parseStart: unusable dates give null", () => {
  assert.equal(E.parseStart({date: "TBD"}), null);
  assert.equal(E.parseStart({}), null);
  assert.equal(E.parseStart(null), null);
  assert.equal(E.parseStart({date: "Smarch 3, 2026"}), null);
});

test("manilaYMD and ymdToUTC agree on the calendar day", () => {
  assert.equal(E.manilaYMD(new Date("2026-09-27T17:00:00Z")), "2026-09-28", "01:00 next day in Manila");
  assert.equal(E.manilaYMD(new Date("2026-09-27T15:59:00Z")), "2026-09-27");
  assert.equal((E.ymdToUTC("2026-09-29") - E.ymdToUTC("2026-09-27")) / 86400000, 2);
});

test("eventTimeOf: structured field, then the notes, normalised to HH:MM", () => {
  assert.equal(E.eventTimeOf({time: "19:00"}), "19:00");
  assert.equal(E.eventTimeOf({time: "7:05"}), "07:05");
  assert.equal(E.eventTimeOf({time: "19:00:00"}), "19:00");
  assert.equal(E.eventTimeOf({notes: "Day 1A, 12:00 start, 30k stack"}), "12:00");
  assert.equal(E.eventTimeOf({time: "18:30", notes: "12:00 start"}), "18:30", "field wins");
  assert.equal(E.eventTimeOf({time: "25:00"}), "");
  assert.equal(E.eventTimeOf({time: "12:75"}), "");
  assert.equal(E.eventTimeOf({time: "evening"}), "");
  assert.equal(E.eventTimeOf({}), "");
  assert.equal(E.eventTimeOf(null), "");
});

test("eventStartInstant: Manila wall-clock time as a real instant", () => {
  const t = E.eventStartInstant({date: "2026-10-03", time: "19:00"});
  assert.equal(t.toISOString(), "2026-10-03T11:00:00.000Z");
  // early-morning start is the PREVIOUS day in UTC
  assert.equal(E.eventStartInstant({date: "2026-10-03", time: "00:30"}).toISOString(), "2026-10-02T16:30:00.000Z");
  assert.equal(E.eventStartInstant({date: "2026-10-03", time: "23:59"}).toISOString(), "2026-10-03T15:59:00.000Z");
  assert.equal(E.eventStartInstant({date: "March 22-24, 2026", notes: "14:00 start"}).toISOString(), "2026-03-22T06:00:00.000Z");
});

test("eventStartInstant: null when there is no date or no time", () => {
  assert.equal(E.eventStartInstant({date: "2026-10-03"}), null);
  assert.equal(E.eventStartInstant({time: "19:00"}), null);
  assert.equal(E.eventStartInstant({date: "TBD", time: "19:00"}), null);
});

test("manilaHour is the hour on a Manila clock", () => {
  assert.equal(E.manilaHour(new Date("2026-10-03T00:00:00Z")), 8);
  assert.equal(E.manilaHour(new Date("2026-10-03T15:59:00Z")), 23);
  assert.equal(E.manilaHour(new Date("2026-10-03T16:00:00Z")), 0, "midnight is 0, not 24");
});
