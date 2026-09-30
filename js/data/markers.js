"use strict";

// Live hand markers: one tap at the table drops a marker (big pot, ICM spot, opponent read,
// uncertain decision, tilt, review later) that is saved as a normal hand with the time and stack,
// to be finished later. The marker's category is also the hand's tag, so tags double as leak tags.
// Pure logic, loaded as a classic script (window.PokerHQMarkers) and importable from Node for
// tests/markers.test.js. The buttons and pages that use it are in js/features/live-markers.js.
(function (root) {
  // id is stored on hands (hand.tags) and must stay stable: it is the leak-tag name.
  var KINDS = [
    { id: "bigpot", label: "Big pot", icon: "💰", hint: "A pot that could make or break your stack" },
    { id: "icm", label: "ICM spot", icon: "⚖️", hint: "Bubble, pay jump or final table decision" },
    { id: "read", label: "Opponent read", icon: "👁", hint: "You learned something about a player" },
    { id: "unsure", label: "Uncertain decision", icon: "🤔", hint: "You are not sure you got it right" },
    { id: "tilt", label: "Tilt", icon: "🔥", hint: "Emotion is affecting your play" },
    { id: "later", label: "Review later", icon: "🔖", hint: "Come back to this hand" }
  ];
  var BY_ID = {};
  KINDS.forEach(function (k) { BY_ID[k.id] = k; });

  // A second tap of the same button inside this window is a slip of the thumb, not a second marker.
  var DEBOUNCE_MS = 1500;
  var MAX_TEXT = 24;

  function kindById(id) { return Object.prototype.hasOwnProperty.call(BY_ID, id) ? BY_ID[id] : null; }
  function isKind(id) { return kindById(id) !== null; }

  // 3725000 → "1:02:05", 125000 → "2:05". Null / bad input → "".
  function formatElapsed(ms) {
    if (typeof ms !== "number" || !isFinite(ms) || ms < 0) return "";
    var total = Math.floor(ms / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
    return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
  }

  // "24", "24bb", "24 BB", "24.46" → "24bb" / "24.5bb". Anything else is kept as typed (short).
  function normalizeStack(text) {
    var t = String(text === null || typeof text === "undefined" ? "" : text).trim();
    if (!t) return "";
    var m = t.match(/^(\d+(?:\.\d+)?)\s*(?:bb|BB|Bb|bB)?$/);
    if (m) {
      var n = Math.round(parseFloat(m[1]) * 10) / 10;
      return n > 0 ? String(n) + "bb" : "";
    }
    return t.slice(0, MAX_TEXT);
  }

  function normalizeLevel(text) {
    return String(text === null || typeof text === "undefined" ? "" : text).trim().slice(0, MAX_TEXT);
  }

  function shouldIgnoreTap(lastKind, lastAt, kind, now) {
    return !!lastKind && lastKind === kind && typeof lastAt === "number" && now - lastAt >= 0 && now - lastAt < DEBOUNCE_MS;
  }

  // The hand record a tap creates. opts: {kind, now, elapsedMs, stack, level, sessionLabel,
  // pendingSessionKey, existingIds}. Returns null for an unknown kind.
  function buildMarker(opts) {
    var o = opts || {};
    var kind = kindById(o.kind);
    if (!kind) return null;
    var now = typeof o.now === "number" ? o.now : Date.now();
    var taken = {};
    (o.existingIds || []).forEach(function (id) { taken[id] = true; });
    var id = now;
    while (taken[id]) id++;
    var marker = { kind: kind.id, at: now };
    if (typeof o.elapsedMs === "number" && isFinite(o.elapsedMs) && o.elapsedMs >= 0) marker.elapsedMs = Math.round(o.elapsedMs);
    var stack = normalizeStack(o.stack);
    if (stack) marker.stack = stack;
    var level = normalizeLevel(o.level);
    if (level) marker.level = level;
    return {
      id: id,
      sessionId: 0,
      session: o.sessionLabel || "",
      pendingSessionKey: o.pendingSessionKey || "",
      title: kind.label,
      desc: "",
      lesson: "",
      result: "",             // "Not sure yet" until the hand is finished
      tags: [kind.id],
      needsDetails: true,
      marker: marker
    };
  }

  // "Big pot · 42:10 in · 24bb · L12". Falls back to the clock time when the session timer was not running.
  function describeMarker(hand, clockLabel) {
    var m = hand && hand.marker;
    if (!m) return "";
    var kind = kindById(m.kind);
    var bits = [kind ? kind.label : "Marker"];
    var elapsed = formatElapsed(m.elapsedMs);
    if (elapsed) bits.push(elapsed + " in");
    else if (clockLabel) bits.push(clockLabel);
    if (m.stack) bits.push(m.stack);
    if (m.level) bits.push(m.level);
    return bits.join(" · ");
  }

  // The known tag ids on a hand, in the buttons' order, without repeats.
  function handTags(hand) {
    var raw = hand && Array.isArray(hand.tags) ? hand.tags : [];
    return KINDS.map(function (k) { return k.id; }).filter(function (id) { return raw.indexOf(id) !== -1; });
  }

  function toggleTag(tags, id) {
    if (!isKind(id)) return handTags({ tags: tags });
    var has = (tags || []).indexOf(id) !== -1;
    var next = has ? (tags || []).filter(function (t) { return t !== id; }) : (tags || []).concat([id]);
    return handTags({ tags: next });
  }

  function isFinished(hand) { return !(hand && hand.needsDetails === true); }

  // For the filter bar: how many hands carry each tag, and how many marked hands still need details.
  function tagSummary(hands) {
    var list = Array.isArray(hands) ? hands : [];
    var counts = KINDS.map(function (k) {
      return { id: k.id, label: k.label, icon: k.icon, count: list.filter(function (h) { return handTags(h).indexOf(k.id) !== -1; }).length };
    });
    return { total: list.length, unfinished: list.filter(function (h) { return !isFinished(h); }).length, counts: counts };
  }

  // filter: {sessionId, tag}. tag is "" (all), "unfinished", or a tag id.
  function filterHands(hands, filter) {
    var f = filter || {};
    return (Array.isArray(hands) ? hands : []).filter(function (h) {
      if (f.sessionId && h.sessionId !== f.sessionId) return false;
      if (f.tag === "unfinished") return !isFinished(h);
      if (f.tag && isKind(f.tag)) return handTags(h).indexOf(f.tag) !== -1;
      return true;
    });
  }

  // Saving an edited hand finishes it; its marker (time, stack, level) is kept.
  function finishHand(hand, tags) {
    hand.tags = handTags({ tags: tags });
    hand.needsDetails = false;
    return hand;
  }

  var api = {
    KINDS: KINDS,
    DEBOUNCE_MS: DEBOUNCE_MS,
    kindById: kindById,
    isKind: isKind,
    formatElapsed: formatElapsed,
    normalizeStack: normalizeStack,
    normalizeLevel: normalizeLevel,
    shouldIgnoreTap: shouldIgnoreTap,
    buildMarker: buildMarker,
    describeMarker: describeMarker,
    handTags: handTags,
    toggleTag: toggleTag,
    isFinished: isFinished,
    tagSummary: tagSummary,
    filterHands: filterHands,
    finishHand: finishHand
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQMarkers = api;
})(typeof window !== "undefined" ? window : undefined);
