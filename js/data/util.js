"use strict";

// Small pure helpers shared by the classic feature scripts. Loaded before them
// (see index.html) and also importable from Node (module.exports) so the logic
// can be unit-tested — see tests/util.test.js.
(function (root) {
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  // Calendar date (YYYY-MM-DD) in the device's LOCAL time zone. The old
  // `new Date().toISOString().split("T")[0]` returns the UTC date, which is the
  // previous day for the first 8 hours after midnight in Manila (UTC+8).
  function todayLocal(date) {
    var d = date || new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  // Session result badge. "final" means a top-3 cash. A cash with no finishing
  // position logged is a plain ITM — position 0/blank must never count as 1st.
  function sessionResult(prize, position) {
    var p = Number(prize) || 0;
    var pos = Number(position) || 0;
    if (!(p > 0)) return "bust";
    return pos >= 1 && pos <= 3 ? "final" : "itm";
  }

  // Game formats offered on the session form. Calendar events use the same words
  // (plus a few the AI research adds), so a session started from the calendar
  // lands on the right one.
  var SESSION_FORMATS = ["Freezeout", "Re-entry", "Regular", "Deep Stack", "Turbo", "Hyper Turbo", "Bounty / PKO", "Short Deck", "Satellite / Qualifier", "Other"];

  // Any calendar/AI structure text → one of SESSION_FORMATS, or "" when there is none.
  function normalizeFormat(text) {
    var t = String(text == null ? "" : text).trim();
    if (!t) return "";
    var lower = t.toLowerCase();
    for (var i = 0; i < SESSION_FORMATS.length; i++) {
      if (SESSION_FORMATS[i].toLowerCase() === lower) return SESSION_FORMATS[i];
    }
    if (/hyper/.test(lower)) return "Hyper Turbo";
    if (/turbo/.test(lower)) return "Turbo";
    if (/bounty|pko|knockout/.test(lower)) return "Bounty / PKO";
    if (/satellite|qualifier|feeder/.test(lower)) return "Satellite / Qualifier";
    if (/re-?entry|reentry/.test(lower)) return "Re-entry";
    if (/freeze/.test(lower)) return "Freezeout";
    if (/deep/.test(lower)) return "Deep Stack";
    if (/short.?deck|6\+/.test(lower)) return "Short Deck";
    return "Other";
  }

  // Everything a tournament paid you: the placement prize plus any bounties
  // (PKO / bounty events). Bounties never make a cash on their own — the result
  // badge follows the placement prize only — but they are real money: they count
  // toward P&L, ROI, and what backers are owed.
  function sessionWinnings(s) {
    if (!s) return 0;
    return (Number(s.prize) || 0) + (Number(s.bounties) || 0);
  }

  // Repairs sessions saved by the old classifier (cash + blank position tagged
  // "final"). Mutates in place, returns {list, changed}; idempotent.
  function normalizeSessions(list) {
    var changed = false;
    if (!Array.isArray(list)) return { list: list, changed: false };
    list.forEach(function (s) {
      if (!s || typeof s !== "object") return;
      if (s.result === "final" && (Number(s.prize) || 0) > 0 && !((Number(s.position) || 0) >= 1)) {
        s.result = "itm";
        changed = true;
      }
    });
    return { list: list, changed: changed };
  }

  // ── Bankroll bookkeeping ────────────────────────────────────────────────
  // The stored bankroll floors at ₱0. To keep add / edit / delete / undo exactly
  // reversible, each session records the amount it *actually* moved the bankroll
  // (`bankrollApplied`), which differs from `pnl` when the floor clipped a loss.
  // Sessions saved before this field existed fall back to `pnl`.
  function sessionBankrollDelta(s) {
    if (!s) return 0;
    return typeof s.bankrollApplied === "number" ? s.bankrollApplied : (Number(s.pnl) || 0);
  }

  // Apply (or re-apply, on edit) a session's P&L. `oldApplied` is what it moved
  // the bankroll by before (0 for a brand-new session).
  function applySessionToBankroll(amount, oldApplied, pnl) {
    var base = Math.max(0, (Number(amount) || 0) - (Number(oldApplied) || 0));
    var next = Math.max(0, base + (Number(pnl) || 0));
    return { amount: next, applied: next - base };
  }

  // Take a session's effect back out (delete).
  function removeSessionFromBankroll(amount, applied) {
    return Math.max(0, (Number(amount) || 0) - (Number(applied) || 0));
  }

  // Consistency check between the stored bankroll and the history that should
  // explain it: stored = starting + Σ session deltas + Σ bankroll transfers.
  // For a profile that began at ₱0 and funded itself through the Treasury the
  // implied starting bankroll is ₱0; anything else means the number drifted (or
  // there was money the ledger never recorded).
  function bankrollCheck(amount, sessions, ledgerBankrollDeltas) {
    var sessionsDelta = 0;
    (sessions || []).forEach(function (s) { sessionsDelta += sessionBankrollDelta(s); });
    var ledgerDelta = 0;
    (ledgerBankrollDeltas || []).forEach(function (d) { ledgerDelta += Number(d) || 0; });
    var stored = Number(amount) || 0;
    var implied = Math.round((stored - sessionsDelta - ledgerDelta) * 100) / 100;
    return {
      stored: stored,
      sessionsDelta: sessionsDelta,
      ledgerDelta: ledgerDelta,
      impliedStart: implied,
      target: Math.max(0, sessionsDelta + ledgerDelta),
      ok: Math.abs(implied) < 0.5
    };
  }

  // ── Cloud size limit ────────────────────────────────────────────────────
  // Every synced list is stored as ONE Firestore document (a JSON string), and a
  // document can't exceed 1 MiB. These helpers let the app warn well before a
  // save is refused, and recognise the refusal when it happens anyway.
  var CLOUD_DOC_LIMIT_BYTES = 1048576;
  var CLOUD_WARN_AT = 0.7;
  var CLOUD_CRITICAL_AT = 0.9;
  var CLOUD_DOC_OVERHEAD = 64;   // the {value, updated} wrapper around the JSON string

  function utf8Length(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; }   // surrogate pair = one 4-byte character
      else n += 3;
    }
    return n;
  }

  function estimateStoredBytes(value) {
    var json;
    try { json = JSON.stringify(value === undefined ? null : value); } catch (e) { return 0; }
    return utf8Length(json || "") + CLOUD_DOC_OVERHEAD;
  }

  // data: {key: value}. Returns the lists at or past the warning level, biggest first.
  function cloudSizeWarnings(data) {
    var out = [];
    Object.keys(data || {}).forEach(function (key) {
      var bytes = estimateStoredBytes(data[key]);
      var pct = bytes / CLOUD_DOC_LIMIT_BYTES;
      if (pct >= CLOUD_WARN_AT) {
        out.push({ key: key, bytes: bytes, pct: Math.round(pct * 100), level: pct >= CLOUD_CRITICAL_AT ? "critical" : "warn" });
      }
    });
    out.sort(function (a, b) { return b.bytes - a.bytes; });
    return out;
  }

  // Firestore's refusal of an oversized document, in the wordings it uses.
  function isCloudTooLargeError(err) {
    var text = String((err && err.message) || err || "");
    return /exceeds the maximum|maximum allowed size|longer than \d+ bytes|payload size|request is too large/i.test(text);
  }

  var api = {
    todayLocal: todayLocal,
    sessionResult: sessionResult,
    sessionWinnings: sessionWinnings,
    SESSION_FORMATS: SESSION_FORMATS,
    normalizeFormat: normalizeFormat,
    normalizeSessions: normalizeSessions,
    sessionBankrollDelta: sessionBankrollDelta,
    applySessionToBankroll: applySessionToBankroll,
    removeSessionFromBankroll: removeSessionFromBankroll,
    bankrollCheck: bankrollCheck,
    CLOUD_DOC_LIMIT_BYTES: CLOUD_DOC_LIMIT_BYTES,
    utf8Length: utf8Length,
    estimateStoredBytes: estimateStoredBytes,
    cloudSizeWarnings: cloudSizeWarnings,
    isCloudTooLargeError: isCloudTooLargeError
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") {
    Object.keys(api).forEach(function (k) { root[k] = api[k]; });
  }
})(typeof window !== "undefined" ? window : undefined);
