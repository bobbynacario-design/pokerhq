"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const u = require("../js/data/util.js");

test("todayLocal uses the local calendar date, not UTC", () => {
  // 01:30 local on Sep 29 — the UTC date is Sep 28 whenever the zone is ahead of UTC.
  const d = new Date(2026, 8, 29, 1, 30);
  assert.equal(u.todayLocal(d), "2026-09-29");
  assert.equal(u.todayLocal(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("sessionResult: blank position on a cash is ITM, not final", () => {
  assert.equal(u.sessionResult(5000, 0), "itm");
  assert.equal(u.sessionResult(5000, ""), "itm");
  assert.equal(u.sessionResult(5000, undefined), "itm");
  assert.equal(u.sessionResult(5000, "abc"), "itm");
});

test("sessionResult: top-3 cash is final, deeper cash is ITM, no prize is bust", () => {
  assert.equal(u.sessionResult(9000, 1), "final");
  assert.equal(u.sessionResult(9000, 3), "final");
  assert.equal(u.sessionResult(9000, 4), "itm");
  assert.equal(u.sessionResult(0, 2), "bust");
  assert.equal(u.sessionResult(0, 0), "bust");
});

test("normalizeSessions repairs old mis-tagged cashes and is idempotent", () => {
  const list = [
    { id: 1, result: "final", prize: 5000, position: 0 },   // bug victim
    { id: 2, result: "final", prize: 5000, position: 2 },   // legit
    { id: 3, result: "bust", prize: 0, position: 0 },
    { id: 4, result: "itm", prize: 100, position: 9 }
  ];
  const first = u.normalizeSessions(list);
  assert.equal(first.changed, true);
  assert.deepEqual(list.map(s => s.result), ["itm", "final", "bust", "itm"]);
  assert.equal(u.normalizeSessions(list).changed, false);
  assert.equal(u.normalizeSessions(null).changed, false);
});

test("bankroll: loss clipped at the ₱0 floor is fully reversible on delete", () => {
  // The reported bug: ₱0 bankroll, lose ₱1,000, delete the session -> phantom ₱1,000.
  let amount = 0;
  const added = u.applySessionToBankroll(amount, 0, -1000);
  assert.equal(added.amount, 0);
  assert.equal(added.applied, 0);
  amount = u.removeSessionFromBankroll(added.amount, added.applied);
  assert.equal(amount, 0);
});

test("bankroll: partially clipped loss restores exactly", () => {
  const added = u.applySessionToBankroll(5000, 0, -8000);
  assert.equal(added.amount, 0);
  assert.equal(added.applied, -5000);
  assert.equal(u.removeSessionFromBankroll(added.amount, added.applied), 5000);
});

test("bankroll: normal win/loss round-trips", () => {
  const win = u.applySessionToBankroll(10000, 0, 4000);
  assert.deepEqual(win, { amount: 14000, applied: 4000 });
  assert.equal(u.removeSessionFromBankroll(win.amount, win.applied), 10000);
});

test("bankroll: editing a session re-applies against its old effect", () => {
  let amount = 10000;
  const first = u.applySessionToBankroll(amount, 0, 4000);      // +4000
  amount = first.amount;                                          // 14000
  const edited = u.applySessionToBankroll(amount, first.applied, -2000);
  assert.equal(edited.amount, 8000);
  assert.equal(edited.applied, -2000);
  // and deleting the edited session returns to the pre-session bankroll
  assert.equal(u.removeSessionFromBankroll(edited.amount, edited.applied), 10000);
});

test("bankroll: legacy sessions without bankrollApplied fall back to pnl", () => {
  assert.equal(u.sessionBankrollDelta({ pnl: -700 }), -700);
  assert.equal(u.sessionBankrollDelta({ pnl: -700, bankrollApplied: 0 }), 0);
  assert.equal(u.sessionBankrollDelta(null), 0);
  assert.equal(u.removeSessionFromBankroll(3000, -700 * -1), 2300);
});

test("bankrollCheck: consistent history implies a ₱0 starting bankroll", () => {
  const sessions = [{ pnl: 4000 }, { pnl: -1500 }];
  const check = u.bankrollCheck(12500, sessions, [10000]);
  assert.equal(check.impliedStart, 0);
  assert.equal(check.ok, true);
  assert.equal(check.target, 12500);
});

test("bankrollCheck: drift shows up as a non-zero implied start", () => {
  const sessions = [{ pnl: -1000 }];
  // stored 1000 but history (top-up 0, one loss of 1000) explains -1000
  const check = u.bankrollCheck(1000, sessions, []);
  assert.equal(check.impliedStart, 2000);
  assert.equal(check.ok, false);
  assert.equal(check.target, 0);
});

test("sessionWinnings adds bounties to the placement prize", () => {
  assert.equal(u.sessionWinnings({prize: 5000, bounties: 1500}), 6500);
  assert.equal(u.sessionWinnings({prize: 5000}), 5000, "sessions saved before bounties existed");
  assert.equal(u.sessionWinnings({bounties: 800}), 800);
  assert.equal(u.sessionWinnings({prize: "abc", bounties: null}), 0);
  assert.equal(u.sessionWinnings(null), 0);
});

test("bounties never turn a bust into a cash", () => {
  // result follows the placement prize only; bounty-only sessions stay 'bust' but the P&L is real money
  assert.equal(u.sessionResult(0, 40), "bust");
  const s = {prize: 0, bounties: 1500, total: 3000, pnl: 1500 - 3000};
  assert.equal(u.sessionWinnings(s) - s.total, s.pnl);
});
