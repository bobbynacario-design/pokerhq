"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const B = require("../js/data/backup-format.js");
const server = require("../functions/backup.js");

const good = (over) => Object.assign({
  app: "PokerHQ", format: "backup", version: 1, exportedAt: "2026-09-29T10:00:00.000Z",
  data: {
    sessions: [{ id: 1, name: "a", date: "2026-09-01", total: 1000, prize: 0, pnl: -1000, result: "bust" }],
    hands: [], tourneys: [], strategies: [], news: [], spotlights: [], satellites: [], opponents: [],
    bankroll: { amount: 500, rule: 5 }, satTarget: { name: "", buyin: 0 },
  },
}, over || {});

test("a current backup is accepted, and the result carries what the restore screen needs", () => {
  const r = B.parse(good());
  assert.equal(r.ok, true);
  assert.equal(r.version, 1);
  assert.equal(r.migrated, false);
  assert.equal(r.exportedAt, "2026-09-29T10:00:00.000Z");
  assert.deepEqual(r.notes, []);
  assert.equal(r.data.sessions.length, 1);
  // things added after the first backups get safe defaults
  assert.deepEqual(r.data.wallet, { balance: 0 });
  assert.deepEqual(r.data.walletLedger, []);
  assert.deepEqual(r.data.goals, {});
  assert.deepEqual(r.data.reminderSettings, {});
  assert.equal(r.data.timer, null);
});

test("files from before versions were checked (no version, or just the bare data) still restore", () => {
  const noVersion = good(); delete noVersion.version;
  assert.equal(B.parse(noVersion).ok, true);
  assert.equal(B.parse(noVersion).version, 1);
  const bare = good().data;
  const r = B.parse(bare);
  assert.equal(r.ok, true);
  assert.equal(r.exportedAt, null);
});

test("a backup from a NEWER version is refused with a clear message, never guessed at", () => {
  const r = B.parse(good({ version: 2 }));
  assert.equal(r.ok, false);
  assert.match(r.message, /newer version of PokerHQ/);
  assert.match(r.message, /v2/);
  assert.match(r.message, /reads up to v1/);
  assert.match(r.message, /Reload PokerHQ/);
});

test("nonsense versions are refused", () => {
  for (const v of [0, -1, 1.5, "1", "abc", null, NaN, Infinity, {}, []]) {
    const r = B.parse(good({ version: v }));
    assert.equal(r.ok, false, JSON.stringify(v));
    assert.match(r.message, /unrecognised format version/);
  }
});

test("files that are not PokerHQ backups are refused", () => {
  for (const junk of [null, undefined, 5, "text", [], [1, 2]]) {
    assert.equal(B.parse(junk).ok, false);
    assert.match(B.parse(junk).message, /not a valid PokerHQ backup object/);
  }
  assert.match(B.parse(good({ app: "SomethingElse" })).message, /not a PokerHQ backup \(it comes from "SomethingElse"\)/);
  assert.match(B.parse(good({ format: "export" })).message, /not a PokerHQ backup file/);
  assert.equal(B.parse({ hello: "world" }).ok, false, "an object with none of the lists");
});

test("missing or malformed parts are named in the message", () => {
  for (const key of ["sessions", "hands", "tourneys", "strategies", "news", "spotlights", "satellites", "opponents"]) {
    const g = good(); delete g.data[key];
    assert.match(B.parse(g).message, new RegExp('missing a valid "' + key + '" array'));
    const h = good(); h.data[key] = "nope";
    assert.equal(B.parse(h).ok, false);
  }
  const noBank = good(); delete noBank.data.bankroll;
  assert.match(B.parse(noBank).message, /bankroll object/);
  const noSat = good(); delete noSat.data.satTarget;
  assert.match(B.parse(noSat).message, /satellite target/);
  const badTimer = good(); badTimer.data.timer = "x";
  assert.match(B.parse(badTimer).message, /timer data is invalid/);
  const badGoals = good(); badGoals.data.goals = [];
  assert.match(B.parse(badGoals).message, /goals data is invalid/);
  const badRem = good(); badRem.data.reminderSettings = 3;
  assert.match(B.parse(badRem).message, /reminder settings are invalid/);
});

test("damaged records are dropped and reported, the good ones are kept", () => {
  const g = good();
  g.data.sessions.push(null, 7, "x", [], { id: 2, name: "b", date: "2026-09-02", total: 500, prize: 0, pnl: -500, result: "bust" });
  g.data.hands = [{ id: 1, title: "h" }, null];
  const r = B.parse(g);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.sessions.map((s) => s.id), [1, 2]);
  assert.equal(r.data.hands.length, 1);
  assert.match(r.notes.join(" "), /Skipped 5 damaged records/);
  assert.match(r.notes.join(" "), /sessions, hands/);
  const one = good(); one.data.sessions.push(null);
  assert.match(B.parse(one).notes[0], /Skipped 1 damaged record \(sessions\)\./);
});

test("old mis-tagged session results are repaired, and an invalid bankroll amount is reset", () => {
  const g = good();
  g.data.sessions = [{ id: 1, result: "final", prize: 5000, position: 0 }, { id: 2, result: "final", prize: 5000, position: 2 }];
  g.data.bankroll = { amount: "lots", rule: 5 };
  const r = B.parse(g);
  assert.deepEqual(r.data.sessions.map((s) => s.result), ["itm", "final"]);
  assert.equal(r.data.bankroll.amount, 0);
  assert.equal(r.data.bankroll.rule, 5);
  assert.match(r.notes.join(" "), /Repaired some old session results/);
  assert.match(r.notes.join(" "), /invalid bankroll amount/);
});

test("parse never changes the object it was given", () => {
  const g = good();
  g.data.sessions.push(null);
  g.data.sessions.push({ id: 9, result: "final", prize: 100, position: 0 });
  const frozen = JSON.stringify(g);
  B.parse(g);
  assert.equal(JSON.stringify(g), frozen);
});

test("older formats are upgraded one step at a time, in order", () => {
  const migrations = {
    1: (d) => { d.wallet = { balance: 123 }; d.upgradedBy = ["1to2"]; return d; },
    2: (d) => { d.upgradedBy.push("2to3"); d.goals = { profit: 1 }; return d; },
  };
  const r = B.parse(good({ version: 1 }), { currentVersion: 3, migrations });
  assert.equal(r.ok, true);
  assert.equal(r.migrated, true);
  assert.deepEqual(r.data.wallet, { balance: 123 });
  assert.deepEqual(r.data.goals, { profit: 1 });
  assert.match(r.notes[0], /Upgraded from backup format v1 to v3/);
  // starting further along skips the earlier steps
  const later = B.parse(good({ version: 2 }), { currentVersion: 3, migrations });
  assert.equal(later.ok, false, "the step 2 function needs the array step 1 makes");
});

test("a missing upgrade step fails clearly instead of importing half-understood data", () => {
  const r = B.parse(good({ version: 1 }), { currentVersion: 2, migrations: {} });
  assert.equal(r.ok, false);
  assert.match(r.message, /older format \(v1\)/);
  const bad = B.parse(good({ version: 1 }), { currentVersion: 2, migrations: { 1: () => null } });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /failed/);
  assert.equal(B.runMigrations({}, 1, 1).ok, true, "nothing to do at the current version");
});

test("readVersion: no version means 1", () => {
  assert.equal(B.readVersion({}), 1);
  assert.equal(B.readVersion({ version: 3 }), 3);
  assert.equal(B.readVersion({ version: "3" }), null);
  assert.equal(B.readVersion(null), 1);
});

test("the weekly server backup and this app agree on the backup version", () => {
  const payload = server.buildBackupPayload(server.buildBackupData({}), { now: new Date("2026-09-29T00:00:00Z") });
  assert.equal(payload.version, B.CURRENT_VERSION, "functions/backup.js writes a different backup version than the app reads");
  assert.equal(payload.app, B.APP);
  assert.equal(payload.format, B.FORMAT);
  // and the app can restore what the server wrote
  const r = B.parse(JSON.parse(JSON.stringify(payload)));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.source, "server-weekly");
});

test("the app writes the current version when it exports a backup", () => {
  const lib = fs.readFileSync(path.join(__dirname, "..", "js", "features", "library.js"), "utf8");
  assert.match(lib, /version: *\(?window\.PokerHQBackup\)? *\?/, "getBackupSnapshot must take the version from PokerHQBackup.CURRENT_VERSION");
  assert.doesNotMatch(lib, /version: 1,/, "no hard-coded backup version left in library.js");
});
