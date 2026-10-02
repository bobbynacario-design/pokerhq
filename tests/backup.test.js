"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const b = require("../functions/backup.js");

const doc = (v) => ({value: JSON.stringify(v), updated: 1});

test("BACKUP_KEYS matches the app's FIRESTORE_KEYS", () => {
  const fs = require("node:fs");
  const src = fs.readFileSync(require.resolve("../js/data/config.js"), "utf8");
  const block = src.slice(src.indexOf("FIRESTORE_KEYS"), src.indexOf("];", src.indexOf("FIRESTORE_KEYS")));
  const appKeys = [...block.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]).filter((k) => k !== "FIRESTORE_KEYS");
  assert.deepEqual([...b.BACKUP_KEYS].sort(), [...appKeys].sort());
});

test("buildBackupData fills defaults for missing docs", () => {
  const data = b.buildBackupData({});
  assert.deepEqual(data.sessions, []);
  assert.deepEqual(data.bankroll, {amount: 0, rule: 15});
  assert.deepEqual(data.satTarget, {name: "", buyin: 0});
  assert.equal(data.timer, null);
  assert.equal(Object.keys(data).length, 19);
  assert.deepEqual(data.drillState, {});
  assert.deepEqual(data.reviewState, {dismissedLeaks: {}});
  assert.deepEqual(data.trips, [], "trips and their costs are part of the backup");
  assert.deepEqual(data.tripExpenses, []);
});

test("buildBackupData parses stored docs", () => {
  const data = b.buildBackupData({
    sessions: doc([{id: 1, pnl: 500}]),
    bankroll: doc({amount: 12000, rule: 5}),
    timer: doc({running: false, elapsed: 5}),
  });
  assert.equal(data.sessions[0].pnl, 500);
  assert.equal(data.bankroll.amount, 12000);
  assert.deepEqual(data.timer, {running: false, elapsed: 5});
});

test("corrupt or wrongly-shaped docs fall back to defaults instead of poisoning the backup", () => {
  const data = b.buildBackupData({
    sessions: {value: "{not json", updated: 1},
    hands: doc({oops: "an object where an array belongs"}),
    bankroll: doc([1, 2, 3]),
    goals: {value: 42},
    wallet: undefined,
  });
  assert.deepEqual(data.sessions, []);
  assert.deepEqual(data.hands, []);
  assert.deepEqual(data.bankroll, {amount: 0, rule: 15});
  assert.deepEqual(data.goals, {});
  assert.deepEqual(data.wallet, {balance: 0});
});

test("payload matches the app's backup format so RESTORE JSON accepts it", () => {
  const data = b.buildBackupData({sessions: doc([{id: 1}])});
  const payload = b.buildBackupPayload(data, {now: new Date("2026-09-27T19:00:00Z"), profile: {id: "legacy-default"}});
  assert.equal(payload.app, "PokerHQ");
  assert.equal(payload.format, "backup");
  assert.equal(payload.version, 1);
  assert.equal(payload.exportedAt, "2026-09-27T19:00:00.000Z");
  assert.equal(payload.source, "server-weekly");
  assert.equal(payload.data, data);
  // the same checks validateBackupPayload (js/features/library.js) makes
  ["sessions", "hands", "tourneys", "strategies", "news", "spotlights", "satellites", "opponents"]
    .forEach((k) => assert.ok(Array.isArray(payload.data[k]), k));
  assert.ok(payload.data.bankroll && typeof payload.data.bankroll === "object" && !Array.isArray(payload.data.bankroll));
  assert.ok(payload.data.satTarget && typeof payload.data.satTarget === "object" && !Array.isArray(payload.data.satTarget));
});

test("an empty profile is never backed up", () => {
  assert.equal(b.isEmptyBackupData(b.buildBackupData({})), true);
  assert.equal(b.isEmptyBackupData(null), true);
  assert.equal(b.isEmptyBackupData(b.buildBackupData({sessions: doc([{id: 1}])})), false);
  assert.equal(b.isEmptyBackupData(b.buildBackupData({wallet: doc({balance: 500})})), false);
  assert.equal(b.isEmptyBackupData(b.buildBackupData({bankroll: doc({amount: 900, rule: 5})})), false);
  // default bankroll (rule only, ₱0) is still empty
  assert.equal(b.isEmptyBackupData(b.buildBackupData({bankroll: doc({amount: 0, rule: 5})})), true);
});

test("hash ignores timestamps and changes with the data", () => {
  const d1 = b.buildBackupData({sessions: doc([{id: 1}])});
  const d2 = b.buildBackupData({sessions: doc([{id: 1}])});
  const d3 = b.buildBackupData({sessions: doc([{id: 1}, {id: 2}])});
  assert.equal(b.hashBackupData(d1), b.hashBackupData(d2));
  assert.notEqual(b.hashBackupData(d1), b.hashBackupData(d3));
});

test("file names use the Manila calendar date", () => {
  // 2026-09-27 18:30 UTC is already 02:30 on the 28th in Manila
  assert.equal(b.backupFileName(new Date("2026-09-27T18:30:00Z")), "pokerhq-backups/weekly/PokerHQ_Backup_2026-09-28.json");
  assert.equal(b.backupFileName(new Date("2026-09-27T10:00:00Z")), "pokerhq-backups/weekly/PokerHQ_Backup_2026-09-27.json");
});

test("retention keeps the newest N and only ever deletes recognised backups", () => {
  const names = [];
  for (let d = 1; d <= 12; d++) names.push("pokerhq-backups/weekly/PokerHQ_Backup_2026-08-" + String(d).padStart(2, "0") + ".json");
  names.push("pokerhq-backups/weekly/notes.txt");
  names.push("pokerhq-backups/weekly/");
  const del = b.selectBackupsToDelete(names, 8);
  assert.equal(del.length, 4);
  assert.deepEqual(del.sort(), [1, 2, 3, 4].map((d) => "pokerhq-backups/weekly/PokerHQ_Backup_2026-08-0" + d + ".json"));
  assert.ok(!del.some((n) => n.endsWith("notes.txt")));
  assert.deepEqual(b.selectBackupsToDelete(names.slice(0, 3), 8), []);
});

test("retention never deletes everything, even with a bad keep value", () => {
  const names = ["a", "pokerhq-backups/weekly/PokerHQ_Backup_2026-08-01.json", "pokerhq-backups/weekly/PokerHQ_Backup_2026-08-08.json"];
  assert.equal(b.selectBackupsToDelete(names, 0).length, 1);
  assert.equal(b.selectBackupsToDelete(names, -5).length, 1);
});

test("a server-built backup passes the app's REAL validateBackupPayload", () => {
  const fs = require("node:fs");
  const vm = require("node:vm");
  const src = fs.readFileSync(require.resolve("../js/features/library.js"), "utf8");
  const sandbox = {
    window: {}, document: {getElementById: () => null}, localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    console, alert() {}, confirm: () => false, Blob: function() {}, URL: {}, todayLocal: () => "2026-09-29",
  };
  vm.createContext(sandbox);
  // library.js hands the actual checking to js/data/backup-format.js
  vm.runInContext(fs.readFileSync(require.resolve("../js/data/backup-format.js"), "utf8"), sandbox);
  vm.runInContext(src, sandbox);
  const data = b.buildBackupData({
    sessions: doc([{id: 1, pnl: 500}]),
    bankroll: doc({amount: 12000, rule: 5}),
  });
  const payload = b.buildBackupPayload(data, {profile: {id: "legacy-default"}});
  // round-trip through JSON exactly as a downloaded file would be
  const checked = sandbox.validateBackupPayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(checked.ok, true, checked.message);
  assert.equal(checked.data.sessions.length, 1);
  assert.equal(checked.data.bankroll.amount, 12000);
  // and an all-defaults backup is also valid
  const empty = sandbox.validateBackupPayload(JSON.parse(JSON.stringify(b.buildBackupPayload(b.buildBackupData({})))));
  assert.equal(empty.ok, true, empty.message);
});
