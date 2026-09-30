"use strict";

// Review Inbox: one list of the things that are waiting for a second look, built from what the app
// already knows. Pure logic, loaded as a classic script (window.PokerHQInbox) and importable from
// Node for tests/inbox.test.js. The page, the Home card and the buttons are js/features/review-inbox.js.
//
// Five sources, each with its own "done" flag stored on the record it came from:
//   hand      needs details, or tagged "review later"          hand.resolvedAt
//   session   logged in the last 14 days, no debrief yet         session.debriefedAt
//   lesson    a hand's lesson, due for a re-read (3, 10, 30d)    hand.lessonStep, hand.lessonSeenAt
//   opponent  villain notes not touched for 60+ days, at a venue you still play   opponent.reviewedAt
//   drill     a Daily Drill you saved (the saved list is on this device, see daily-drill.js)
(function (root) {
  var DAY = 86400000;
  var DEBRIEF_WINDOW_DAYS = 14;
  var OPPONENT_STALE_DAYS = 60;
  var LESSON_STEPS = [3, 10, 30];       // days before a lesson is due again: after it is written, then after each "got it"
  var REVIEW_LATER_TAG = "later";       // the id of the "Review later" marker (js/data/markers.js)
  var MAX_TITLE = 90;

  // Order in the list and on the page: most time-sensitive first.
  var KINDS = {
    session: { label: "Sessions to debrief", icon: "📝", priority: 5 },
    hand: { label: "Hands to review", icon: "🃏", priority: 4 },
    lesson: { label: "Lessons due", icon: "💡", priority: 3 },
    opponent: { label: "Villain notes to refresh", icon: "👤", priority: 2 },
    drill: { label: "Saved drills", icon: "🎯", priority: 1 }
  };
  var KIND_ORDER = ["session", "hand", "lesson", "opponent", "drill"];

  function arr(v) { return Array.isArray(v) ? v : []; }
  function isNum(n) { return typeof n === "number" && isFinite(n); }
  // Whole calendar days from `then` to `now` (device time): a session played the day before yesterday is
  // 2 days ago all day, not "yesterday" until the clock passes the hour it was logged.
  function daysBetween(now, then) {
    var a = new Date(now); a.setHours(0, 0, 0, 0);
    var b = new Date(then); b.setHours(0, 0, 0, 0);
    return Math.round((a.getTime() - b.getTime()) / DAY);
  }

  function ageText(days) {
    if (days === null || typeof days === "undefined" || !isFinite(days)) return "";
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    return days + " days ago";
  }

  function truncate(text, max) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
  }

  // "2026-09-29" → noon that day (device time), or null.
  function dateToTime(text) {
    var m = String(text || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // Record ids are Date.now() when the record was made (demo data uses small ids: not a time).
  function idTime(id) { return isNum(id) && id > 1e12 ? id : null; }

  function sessionTime(session) {
    return dateToTime(session && session.date);
  }

  // When a hand happened: its marker, its id, or the day of the session it belongs to.
  function handTime(hand, sessions) {
    if (hand && hand.marker && isNum(hand.marker.at)) return hand.marker.at;
    var byId = idTime(hand && hand.id);
    if (byId !== null) return byId;
    var s = hand && hand.sessionId ? arr(sessions).filter(function (x) { return x && x.id === hand.sessionId; })[0] : null;
    return s ? sessionTime(s) : null;
  }

  function normalizeVenue(name) {
    return String(name || "").toLowerCase().replace(/[^a-z0-9À-ɏ ]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // "Okada Manila" matches "Okada Manila, Parañaque". Short or empty names never match.
  function venueMatches(a, b) {
    var x = normalizeVenue(a), y = normalizeVenue(b);
    if (x.length < 4 || y.length < 4) return false;
    return x === y || x.indexOf(y) !== -1 || y.indexOf(x) !== -1;
  }

  function makeItem(kind, ref, fields) {
    return {
      key: kind + ":" + ref,
      kind: kind,
      ref: ref,
      title: fields.title,
      detail: fields.detail || "",
      ageDays: isNum(fields.ageDays) ? fields.ageDays : 0,
      action: fields.action || "open",
      priority: KINDS[kind].priority
    };
  }

  // input: {now, sessions, hands, opponents, savedDrills:[{id,title,detail}], recentVenues:[names]}
  function build(input) {
    var o = input || {};
    var now = isNum(o.now) ? o.now : Date.now();
    var sessions = arr(o.sessions), hands = arr(o.hands), opponents = arr(o.opponents);
    var items = [];

    // 1. sessions with no debrief
    sessions.forEach(function (s) {
      if (!s || s.debriefedAt) return;
      var t = sessionTime(s);
      if (t === null) return;
      var age = daysBetween(now, t);
      if (age < 0 || age > DEBRIEF_WINDOW_DAYS) return;
      items.push(makeItem("session", s.id, {
        title: truncate(s.name || "Session", MAX_TITLE),
        detail: "No debrief yet · played " + ageText(age),
        ageDays: age
      }));
    });

    // 2. hands: needs details, or review later
    hands.forEach(function (h) {
      if (!h || h.resolvedAt) return;
      var reasons = [];
      if (h.needsDetails === true) reasons.push("Needs details");
      if (arr(h.tags).indexOf(REVIEW_LATER_TAG) !== -1) reasons.push("Marked review later");
      if (!reasons.length) return;
      var t = handTime(h, sessions);
      var age = t === null ? null : Math.max(0, daysBetween(now, t));
      items.push(makeItem("hand", h.id, {
        title: truncate(h.title || "Hand", MAX_TITLE),
        detail: reasons.join(" · ") + (age !== null ? " · " + ageText(age) : ""),
        ageDays: age,
        action: h.needsDetails === true ? "finish" : "replay"
      }));
    });

    // 3. lessons due for a re-read
    hands.forEach(function (h) {
      if (!h || h.needsDetails === true) return;
      var lesson = String(h.lesson || "").trim();
      if (!lesson) return;
      var step = Math.max(0, Math.floor(Number(h.lessonStep) || 0));
      if (step >= LESSON_STEPS.length) return;
      var base = isNum(h.lessonSeenAt) ? h.lessonSeenAt : handTime(h, sessions);
      if (base === null) return;
      var age = daysBetween(now, base);
      if (age < LESSON_STEPS[step]) return;
      items.push(makeItem("lesson", h.id, {
        title: truncate(lesson, MAX_TITLE),
        detail: "From \"" + truncate(h.title || "a hand", 40) + "\" · re-read " + (step + 1) + " of " + LESSON_STEPS.length,
        ageDays: age,
        action: "replay"
      }));
    });

    // 4. stale villain notes, only where you still play
    var venues = arr(o.recentVenues);
    opponents.forEach(function (op) {
      if (!op || !String(op.notes || "").trim() || !op.venue) return;
      if (!venues.some(function (v) { return venueMatches(op.venue, v); })) return;
      var times = [isNum(op.reviewedAt) ? op.reviewedAt : null, isNum(op.updatedAt) ? op.updatedAt : null, dateToTime(op.added), idTime(op.id)].filter(function (t) { return t !== null; });
      if (!times.length) return;
      var age = daysBetween(now, Math.max.apply(null, times));
      if (age < OPPONENT_STALE_DAYS) return;
      items.push(makeItem("opponent", op.id, {
        title: truncate(op.name || "Villain", MAX_TITLE),
        detail: "Notes last touched " + ageText(age) + " · " + truncate(op.venue, 40),
        ageDays: age
      }));
    });

    // 5. saved drills
    arr(o.savedDrills).forEach(function (d) {
      if (!d || !d.id) return;
      items.push(makeItem("drill", d.id, { title: truncate(d.title || "Drill", MAX_TITLE), detail: d.detail || "You saved this to do later", ageDays: 0 }));
    });

    // most urgent kind first, oldest first within it; ties keep the order they were found in (saved drills stay in the order saved)
    items.forEach(function (it, i) { it.seq = i; });
    items.sort(function (a, b) { return b.priority - a.priority || b.ageDays - a.ageDays || a.seq - b.seq; });
    items.forEach(function (it) { delete it.seq; });
    var byKind = {};
    KIND_ORDER.forEach(function (k) { byKind[k] = 0; });
    items.forEach(function (it) { byKind[it.kind]++; });
    return { items: items, total: items.length, byKind: byKind };
  }

  // What "mark resolved" writes on the record, per kind.
  function resolveFields(kind, record, now) {
    if (kind === "hand") return { resolvedAt: now };
    if (kind === "session") return { debriefedAt: now };
    if (kind === "opponent") return { reviewedAt: now };
    if (kind === "lesson") return { lessonStep: Math.max(0, Math.floor(Number(record && record.lessonStep) || 0)) + 1, lessonSeenAt: now };
    return null;
  }

  // Applies the fields and returns what they replaced, so the resolve can be undone.
  function resolve(kind, record, now) {
    var fields = resolveFields(kind, record, now);
    if (!fields || !record) return null;
    var prev = {};
    Object.keys(fields).forEach(function (k) {
      prev[k] = Object.prototype.hasOwnProperty.call(record, k) ? record[k] : undefined;
      record[k] = fields[k];
    });
    return prev;
  }

  function undo(record, prev) {
    if (!record || !prev) return;
    Object.keys(prev).forEach(function (k) {
      if (typeof prev[k] === "undefined") delete record[k]; else record[k] = prev[k];
    });
  }

  var api = {
    KINDS: KINDS,
    KIND_ORDER: KIND_ORDER,
    DEBRIEF_WINDOW_DAYS: DEBRIEF_WINDOW_DAYS,
    OPPONENT_STALE_DAYS: OPPONENT_STALE_DAYS,
    LESSON_STEPS: LESSON_STEPS,
    REVIEW_LATER_TAG: REVIEW_LATER_TAG,
    ageText: ageText,
    normalizeVenue: normalizeVenue,
    venueMatches: venueMatches,
    handTime: handTime,
    build: build,
    resolveFields: resolveFields,
    resolve: resolve,
    undo: undo
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQInbox = api;
})(typeof window !== "undefined" ? window : undefined);
