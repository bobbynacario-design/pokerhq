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
      returned: returned,
      hours: hours,
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

  // Group by game format. "Not recorded" (sessions logged before formats existed,
  // or with none chosen) always goes last so real formats lead the table.
  function byStructure(sessions) {
    var groups = {}, order = [];
    records(sessions).forEach(function (s) {
      var name = String(s.structure == null ? "" : s.structure).trim() || "Not recorded";
      if (!groups[name]) { groups[name] = []; order.push(name); }
      groups[name].push(s);
    });
    var rows = order.map(function (name) { return summarize(name, groups[name]); });
    rows.sort(function (a, b) {
      if ((a.label === "Not recorded") !== (b.label === "Not recorded")) return a.label === "Not recorded" ? 1 : -1;
      return b.count - a.count || b.pnl - a.pnl;
    });
    return rows;
  }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // "2026-09-27" → "2026-09" (from the date as written; never via UTC), or null.
  function monthKey(dateStr) {
    var m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(dateStr || ""));
    if (!m) return null;
    var mo = Number(m[2]);
    return mo >= 1 && mo <= 12 ? m[1] + "-" + m[2] : null;
  }

  function monthLabel(key) {
    var y = key.slice(0, 4), mo = Number(key.slice(5, 7));
    return MONTHS[mo - 1] + " " + y;
  }

  // Newest month first. `limit` caps the rows (0 / omitted = all months).
  function byMonth(sessions, limit) {
    var groups = {};
    records(sessions).forEach(function (s) {
      var key = monthKey(s.date);
      if (!key) return;
      (groups[key] = groups[key] || []).push(s);
    });
    var rows = Object.keys(groups).sort().reverse().map(function (key) {
      var row = summarize(monthLabel(key), groups[key]);
      row.key = key;
      return row;
    });
    return limit ? rows.slice(0, limit) : rows;
  }

  function csvCell(v) {
    var str = String(v == null ? "" : v);
    return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
  }

  // One line per month, oldest first (spreadsheet-friendly), with a totals row.
  function monthlyCsv(rows) {
    var header = ["Month", "Sessions", "ITM %", "Invested", "Returned", "P&L", "ROI %", "Hours", "P&L per hour"];
    var ordered = (rows || []).slice().sort(function (a, b) { return String(a.key).localeCompare(String(b.key)); });
    var lines = [header.join(",")];
    function line(r, label) {
      return [
        label, r.count, r.itmPct, Math.round(r.invested), Math.round(r.returned), Math.round(r.pnl), r.roi,
        Math.round(r.hours * 10) / 10, r.perHour === null || r.perHour === undefined ? "" : Math.round(r.perHour)
      ].map(csvCell).join(",");
    }
    ordered.forEach(function (r) { lines.push(line(r, r.key || r.label)); });
    if (ordered.length) {
      var all = [];
      // totals recomputed from the rows so the file adds up exactly
      var t = { count: 0, invested: 0, returned: 0, pnl: 0, hours: 0, itmSessions: 0, timedPnl: 0 };
      ordered.forEach(function (r) {
        t.count += r.count; t.invested += r.invested; t.returned += r.returned; t.pnl += r.pnl; t.hours += r.hours;
        t.itmSessions += Math.round(r.itmPct * r.count / 100);
        if (r.perHour !== null && r.perHour !== undefined) t.timedPnl += r.perHour * r.hours;
      });
      lines.push(line({
        count: t.count, itmPct: t.count ? Math.round(t.itmSessions / t.count * 100) : 0,
        invested: t.invested, returned: t.returned, pnl: t.pnl,
        roi: t.invested > 0 ? Math.round(t.pnl / t.invested * 1000) / 10 : 0,
        hours: t.hours, perHour: t.hours > 0 ? t.timedPnl / t.hours : null
      }, "Total"));
    }
    return lines.join("\n") + "\n";
  }

  var api = {
    WEEKDAYS: WEEKDAYS,
    LOW_SAMPLE: LOW_SAMPLE,
    summarize: summarize,
    byVenue: byVenue,
    byWeekday: byWeekday,
    byMonth: byMonth,
    byStructure: byStructure,
    monthKey: monthKey,
    monthlyCsv: monthlyCsv,
    weekdayIndex: weekdayIndex
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQStats = api;
})(typeof window !== "undefined" ? window : undefined);
