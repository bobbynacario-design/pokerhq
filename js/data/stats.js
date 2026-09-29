"use strict";

// Session breakdowns for the dashboard ("Performance by Venue / Weekday").
// Pure functions, loaded as a classic script (window.PokerHQStats) and
// importable from Node for tests/stats.test.js.
(function (root) {
  var WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var LOW_SAMPLE = 3;   // fewer sessions than this is noise, not a trend

  function num(v) { return Number(v) || 0; }

  function summarize(label, list) {
    var invested = 0, returned = 0, itm = 0, timedPnl = 0, hours = 0;
    list.forEach(function (s) {
      invested += num(s.total);
      returned += num(s.prize) + num(s.bounties);
      if (s.result === "itm" || s.result === "final") itm++;
      if (num(s.hours) > 0) { hours += num(s.hours); timedPnl += num(s.pnl); }
    });
    var pnl = returned - invested;
    return {
      label: label,
      count: list.length,
      itmPct: list.length ? Math.round((itm / list.length) * 100) : 0,
      invested: invested,
      pnl: pnl,
      roi: invested > 0 ? Math.round((pnl / invested) * 1000) / 10 : 0,
      // ₱/hr only from sessions that logged hours — dividing everyone's P&L by
      // only some sessions' hours would overstate it.
      perHour: hours > 0 ? timedPnl / hours : null,
      lowSample: list.length < LOW_SAMPLE
    };
  }

  // Only real records: a stray null in the list must not take the dashboard down.
  function records(list) {
    return (Array.isArray(list) ? list : []).filter(function (s) { return s && typeof s === "object"; });
  }

  function cleanVenue(v) { return String(v == null ? "" : v).trim().replace(/\s+/g, " "); }

  // Group by venue, ignoring case/extra spaces, labelled with the spelling used
  // most often. Busiest venues first; anything beyond `limit` rolls into one row.
  function byVenue(sessions, limit) {
    var max = Math.max(2, limit || 12);
    var groups = {}, order = [];
    records(sessions).forEach(function (s) {
      var name = cleanVenue(s.venue);
      var key = name.toLowerCase();
      if (!groups[key]) { groups[key] = { spellings: {}, list: [] }; order.push(key); }
      groups[key].list.push(s);
      if (name) groups[key].spellings[name] = (groups[key].spellings[name] || 0) + 1;
    });
    var entries = order.map(function (key) {
      var g = groups[key];
      var label = "(no venue)", best = 0;
      Object.keys(g.spellings).forEach(function (sp) {
        if (g.spellings[sp] > best) { best = g.spellings[sp]; label = sp; }
      });
      return { list: g.list, row: summarize(label, g.list) };
    });
    entries.sort(function (a, b) { return b.row.count - a.row.count || b.row.pnl - a.row.pnl; });
    if (entries.length <= max) return entries.map(function (e) { return e.row; });
    var keep = entries.slice(0, max - 1);
    var rest = entries.slice(max - 1);
    var restSessions = [];
    rest.forEach(function (e) { restSessions = restSessions.concat(e.list); });
    return keep.map(function (e) { return e.row; })
      .concat([summarize("All other venues (" + rest.length + ")", restSessions)]);
  }

  // "YYYY-MM-DD" → 0 (Mon) … 6 (Sun) using the calendar date as written, never
  // via UTC (which shifts the day in Manila). null for anything unparseable.
  function weekdayIndex(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ""));
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1) return null;
    return (d.getDay() + 6) % 7;
  }

  // Mon → Sun, only days with at least one session.
  function byWeekday(sessions) {
    var buckets = WEEKDAYS.map(function () { return []; });
    records(sessions).forEach(function (s) {
      var i = weekdayIndex(s.date);
      if (i !== null) buckets[i].push(s);
    });
    var rows = [];
    buckets.forEach(function (list, i) {
      if (list.length) rows.push(summarize(WEEKDAYS[i], list));
    });
    return rows;
  }

  var api = {
    WEEKDAYS: WEEKDAYS,
    LOW_SAMPLE: LOW_SAMPLE,
    summarize: summarize,
    byVenue: byVenue,
    byWeekday: byWeekday,
    weekdayIndex: weekdayIndex
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQStats = api;
})(typeof window !== "undefined" ? window : undefined);
