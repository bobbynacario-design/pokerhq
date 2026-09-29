"use strict";

// Event date/time helpers shared by the reminder email and push alerts. Pure
// (no Firebase imports) so they are unit-tested in tests/events.test.js.
//
// The date parsing below mirrors the app's parseTourneyDateRange (start date
// only), plus ISO yyyy-mm-dd for manually-added events. All wall-clock times are
// Asia/Manila (UTC+8, no daylight saving).

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};
const MONTH_ABBR = {JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11};

// A Date at ~noon Manila on the given calendar day, so day-granular comparisons
// via the Asia/Manila locale are stable regardless of the runner's clock.
function utcNoonManila(y, monthIndex, day) {
  return new Date(Date.UTC(y, monthIndex, day, 4, 0, 0));
}

// Mirrors the app's parseTourneyDateRange (start date only), plus ISO yyyy-mm-dd
// for manually-added events.
function parseStart(t) {
  const s = String((t && t.date) || "");
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utcNoonManila(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/(\w+)\s+(\d{1,2})\s*[-–]\s*(?:(\w+)\s+)?(\d{1,2}),?\s*(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo !== undefined) return utcNoonManila(+m[5], mo, +m[2]);
  }
  m = s.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    if (mo !== undefined) return utcNoonManila(+m[3], mo, +m[2]);
  }
  if (t && t.day && t.month) {
    const mo = MONTH_ABBR[String(t.month).toUpperCase()];
    if (mo !== undefined) return utcNoonManila(new Date().getFullYear(), mo, parseInt(t.day, 10));
  }
  return null;
}

function manilaYMD(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function ymdToUTC(ymd) {
  const parts = ymd.split("-").map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]);
}

// Start time as "HH:MM": the structured field when set, otherwise a "HH:MM start"
// phrase in the notes (matches eventTime() in js/features/today-glance.js).
function eventTimeOf(t) {
  const raw = (t && t.time) || "";
  const fromNotes = /(\d{1,2}:\d{2})\s*start/i.exec((t && t.notes) || "");
  const text = String(raw || (fromNotes ? fromNotes[1] : ""));
  const m = /^(\d{1,2}):(\d{2})/.exec(text.trim());
  if (!m) return "";
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) return "";
  return (hh < 10 ? "0" : "") + hh + ":" + m[2];
}

// The moment an event starts (a Date), or null when it has no date or no time.
function eventStartInstant(t) {
  const start = parseStart(t);
  const time = eventTimeOf(t);
  if (!start || !time) return null;
  const ymd = manilaYMD(start).split("-").map(Number);
  const hm = time.split(":").map(Number);
  return new Date(Date.UTC(ymd[0], ymd[1] - 1, ymd[2], hm[0] - 8, hm[1]));
}

// Hour of day (0-23) in Manila.
function manilaHour(date) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila", hour: "2-digit", hourCycle: "h23",
  }).format(date));
}

module.exports = {
  parseStart,
  manilaYMD,
  ymdToUTC,
  utcNoonManila,
  eventTimeOf,
  eventStartInstant,
  manilaHour,
};
