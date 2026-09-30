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

test("explicit final-table status supports deeper finishes without guessing missing status", () => {
  assert.equal(u.sessionResult(5000,9,true),"final");
  assert.equal(u.sessionResult(5000,3,false),"itm");
  assert.equal(u.sessionResult(5000,1,null),"itm");
  assert.equal(u.sessionResult(0,6,true),"final");
  const list=[{result:"itm",prize:5000,position:8,finalTable:true},{result:"final",prize:5000,position:2,finalTable:false},{result:"final",prize:5000,position:4}];
  u.normalizeSessions(list);
  assert.deepEqual(list.map(s=>s.result),["final","itm","final"]);
  assert.equal(u.normalizeSessions(list).changed,false);
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

// ── cloud size guard ──
test("utf8Length counts bytes, not characters (₱ is 3 bytes, an emoji 4)", () => {
  assert.equal(u.utf8Length("abc"), 3);
  assert.equal(u.utf8Length("₱"), 3);
  assert.equal(u.utf8Length("é"), 2);
  assert.equal(u.utf8Length("🃏"), 4);
  assert.equal(u.utf8Length(""), 0);
  const mixed = "Metro ₱3,300 🃏 é";
  assert.equal(u.utf8Length(mixed), Buffer.byteLength(mixed, "utf8"));
});

test("estimateStoredBytes matches what would actually be stored", () => {
  const list = [{id: 1, name: "Sunday ₱3,300 Main", notes: "🃏 AK vs QQ"}];
  const json = JSON.stringify(list);
  assert.equal(u.estimateStoredBytes(list), Buffer.byteLength(json, "utf8") + 64);
  assert.equal(u.estimateStoredBytes([]), 2 + 64);
  assert.equal(u.estimateStoredBytes(undefined), 4 + 64, "undefined stores as null");
  const circular = {}; circular.self = circular;
  assert.equal(u.estimateStoredBytes(circular), 0, "unserialisable values never throw");
});

function listOfBytes(targetBytes) {
  // one record whose JSON is ~targetBytes
  return [{id: 1, notes: "x".repeat(Math.max(0, targetBytes - 60))}];
}

test("cloudSizeWarnings: silent when small, warns at 70%, critical at 90%, biggest first", () => {
  const limit = u.CLOUD_DOC_LIMIT_BYTES;
  assert.deepEqual(u.cloudSizeWarnings({sessions: listOfBytes(50000), hands: []}), []);
  assert.deepEqual(u.cloudSizeWarnings({sessions: listOfBytes(limit * 0.69)}), [], "just under 70%");
  const warn = u.cloudSizeWarnings({sessions: listOfBytes(limit * 0.75)});
  assert.equal(warn.length, 1);
  assert.equal(warn[0].level, "warn");
  assert.ok(warn[0].pct >= 74 && warn[0].pct <= 76, "pct " + warn[0].pct);
  const crit = u.cloudSizeWarnings({sessions: listOfBytes(limit * 0.72), hands: listOfBytes(limit * 0.95)});
  assert.deepEqual(crit.map((w) => w.key), ["hands", "sessions"], "biggest first");
  assert.equal(crit[0].level, "critical");
  assert.equal(crit[1].level, "warn");
  assert.deepEqual(u.cloudSizeWarnings(null), []);
  assert.deepEqual(u.cloudSizeWarnings({a: undefined, b: null}), []);
});

test("isCloudTooLargeError recognises Firestore's wordings and nothing else", () => {
  assert.equal(u.isCloudTooLargeError(new Error("The value of property \"value\" is longer than 1048487 bytes.")), true);
  assert.equal(u.isCloudTooLargeError(new Error("Document cannot be written because its size (1,200,000 bytes) exceeds the maximum allowed size of 1,048,576 bytes.")), true);
  assert.equal(u.isCloudTooLargeError({message: "Request payload size exceeds the limit"}), true);
  assert.equal(u.isCloudTooLargeError(new Error("Missing or insufficient permissions.")), false);
  assert.equal(u.isCloudTooLargeError(new Error("network offline")), false);
  assert.equal(u.isCloudTooLargeError(null), false);
  assert.equal(u.isCloudTooLargeError(undefined), false);
});

// ── game format ──
test("normalizeFormat maps calendar / AI structure text onto the session formats", () => {
  // exact (case-insensitive) matches
  assert.equal(u.normalizeFormat("Freezeout"), "Freezeout");
  assert.equal(u.normalizeFormat("turbo"), "Turbo");
  assert.equal(u.normalizeFormat("Bounty / PKO"), "Bounty / PKO");
  assert.equal(u.normalizeFormat("  deep stack "), "Deep Stack");
  assert.equal(u.normalizeFormat("Satellite / Qualifier"), "Satellite / Qualifier");
  // looser wording the AI or older events use
  assert.equal(u.normalizeFormat("Hyper-Turbo"), "Hyper Turbo");
  assert.equal(u.normalizeFormat("Super Turbo"), "Turbo");
  assert.equal(u.normalizeFormat("Progressive Knockout"), "Bounty / PKO");
  assert.equal(u.normalizeFormat("PKO"), "Bounty / PKO");
  assert.equal(u.normalizeFormat("Mega Satellite"), "Satellite / Qualifier");
  assert.equal(u.normalizeFormat("Feeder"), "Satellite / Qualifier");
  assert.equal(u.normalizeFormat("Re-entry"), "Re-entry");
  assert.equal(u.normalizeFormat("reentry"), "Re-entry");
  assert.equal(u.normalizeFormat("Deepstack"), "Deep Stack");
  assert.equal(u.normalizeFormat("Short-deck"), "Short Deck");
  // unknown text is "Other", empty stays empty
  assert.equal(u.normalizeFormat("other"), "Other");
  assert.equal(u.normalizeFormat("Mystery Format"), "Other");
  assert.equal(u.normalizeFormat(""), "");
  assert.equal(u.normalizeFormat(null), "");
  assert.equal(u.normalizeFormat(undefined), "");
});

test("every calendar structure option maps to a real session format", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  const block = html.slice(html.indexOf('id="t-structure"'), html.indexOf("</select>", html.indexOf('id="t-structure"')));
  const options = [...block.matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
  assert.ok(options.length >= 6);
  for (const o of options) assert.ok(u.SESSION_FORMATS.includes(u.normalizeFormat(o)), o);
  // and none collapse to "Other" by accident (Regular / Short Deck etc. are real formats)
  assert.deepEqual(options.filter((o) => u.normalizeFormat(o) === "Other"), []);
});

test("the session form offers exactly the formats the code knows", () => {
  const fs = require("node:fs");
  const html = fs.readFileSync(require("node:path").join(__dirname, "..", "index.html"), "utf8");
  const start = html.indexOf('id="s-structure"');
  const block = html.slice(start, html.indexOf("</select>", start));
  const values = [...block.matchAll(/<option value="([^"]*)">/g)].map((m) => m[1]);
  assert.deepEqual(values, ["", ...u.SESSION_FORMATS]);
});
