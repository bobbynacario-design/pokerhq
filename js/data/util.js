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

  var api = {
    todayLocal: todayLocal,
    sessionResult: sessionResult,
    normalizeSessions: normalizeSessions,
    sessionBankrollDelta: sessionBankrollDelta,
    applySessionToBankroll: applySessionToBankroll,
    removeSessionFromBankroll: removeSessionFromBankroll,
    bankrollCheck: bankrollCheck
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") {
    Object.keys(api).forEach(function (k) { root[k] = api[k]; });
  }
})(typeof window !== "undefined" ? window : undefined);
