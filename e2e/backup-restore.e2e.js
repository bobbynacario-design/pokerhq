"use strict";
// The JSON backup and the RESTORE button, end to end: a backup made by the app
// restores cleanly, a file from a newer PokerHQ or from another app is refused
// without touching anything, and damaged records are skipped and reported.
const assert = require("assert").strict;
const { boot } = require("./lib.js");

const session = (id, name) => ({ id, name, date: "2026-09-01", total: 1000, prize: 0, pnl: -1000, result: "bust" });
const backupFile = (over) => Object.assign({
  app: "PokerHQ", format: "backup", version: 1, exportedAt: "2026-09-20T08:30:00.000Z",
  data: { sessions: [session(99, "from backup")], hands: [], tourneys: [], strategies: [], news: [], spotlights: [], satellites: [], opponents: [], bankroll: { amount: 500, rule: 5 }, satTarget: { name: "", buyin: 0 } },
}, over || {});
const asUpload = (obj) => ({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(typeof obj === "string" ? obj : JSON.stringify(obj)) });

(async () => {
  const { page, dialogs, realErrors, close } = await boot({ viewport: { width: 1280, height: 900 } });
  const ok = (m) => console.log("ok  " + m);
  const names = () => page.evaluate(() => sessions.map((s) => s.name));
  const upload = async (obj) => { dialogs.length = 0; await page.setInputFiles("#backup-restore-input", asUpload(obj)); await page.waitForTimeout(500); };
  const mine = [session(1, "keep me"), session(2, "and me")];
  const reset = () => page.evaluate((m) => { window.sessions = JSON.parse(JSON.stringify(m)); window.hands = []; window.tourneys = []; save("sessions", sessions); hideUndoToast && hideUndoToast(); }, mine);
  await page.evaluate(() => switchGroup("play", "sessions"));
  await reset();

  // 1. the app's own backup carries the current format version and restores exactly
  const made = await page.evaluate(() => getBackupSnapshot());
  assert.equal(made.version, await page.evaluate(() => PokerHQBackup.CURRENT_VERSION));
  assert.equal(made.app, "PokerHQ");
  assert.equal(made.format, "backup");
  ok("JSON BACKUP writes app, format and the current version (v" + made.version + ")");
  await page.evaluate(() => { window.sessions = [{ id: 7, name: "changed after backup", date: "2026-09-05", total: 100, prize: 0, pnl: -100, result: "bust" }]; save("sessions", sessions); });
  await upload(made);
  assert.deepEqual(await names(), ["keep me", "and me"]);
  ok("restoring the app's own backup brings the saved data back");

  // 2. the confirmation says what the backup holds and when it was made
  await reset();
  await upload(backupFile());
  const confirm = dialogs.find((d) => d.type === "confirm");
  assert.ok(confirm, "the restore asks before overwriting");
  assert.match(confirm.message, /1 sessions, 0 hands, 0 tournaments/);
  assert.match(confirm.message, /Backed up:/);
  assert.match(confirm.message, /a copy of your current data is kept first/i);
  assert.deepEqual(await names(), ["from backup"]);
  assert.equal(await page.isVisible("#restore-undo-btn"), true);
  await page.click("#restore-undo-btn");
  await page.waitForFunction(() => sessions.length === 2);
  ok("the confirmation shows the counts and the backup date; a snapshot is kept and UNDO works");

  // 3. a backup from a NEWER PokerHQ is refused, nothing changes
  await reset();
  await upload(backupFile({ version: 999 }));
  assert.equal(dialogs.filter((d) => d.type === "confirm").length, 0, "no confirm for a file we cannot read");
  const refused = dialogs.find((d) => d.type === "alert");
  assert.ok(refused && /Restore failed/.test(refused.message) && /newer version of PokerHQ/.test(refused.message), JSON.stringify(dialogs));
  assert.match(refused.message, /v999/);
  assert.deepEqual(await names(), ["keep me", "and me"]);
  assert.equal(await page.isVisible("#restore-undo-btn"), false, "nothing was restored, so there is nothing to undo");
  ok("a backup from a newer version is refused with a clear message and changes nothing");

  // 4. files that are not PokerHQ backups are refused
  for (const [label, file, expectText] of [
    ["another app's file", backupFile({ app: "SomethingElse" }), /not a PokerHQ backup/],
    ["a wrong-format file", backupFile({ format: "export" }), /not a PokerHQ backup/],
    ["a list, not an object", "[1,2,3]", /not a valid PokerHQ backup/],
    ["text that is not JSON", "hello", /Restore failed/],
    ["a backup missing its sessions", backupFile({ data: { hands: [] } }), /missing a valid "sessions"/],
  ]) {
    await upload(file);
    const alertMsg = (dialogs.find((d) => d.type === "alert") || {}).message || "";
    assert.match(alertMsg, expectText, label + ": " + alertMsg);
    assert.equal(dialogs.filter((d) => d.type === "confirm").length, 0, label + ": no confirm");
    assert.deepEqual(await names(), ["keep me", "and me"], label + ": data untouched");
  }
  ok("another app's file, a wrong format, non-JSON and incomplete backups are all refused and change nothing");

  // 5. an old file with no version at all (from before versions were checked) still restores
  const legacy = backupFile(); delete legacy.version;
  await upload(legacy);
  assert.deepEqual(await names(), ["from backup"]);
  ok("a file with no version number (older backup) still restores");

  // 6. damaged records are skipped and reported before anything is overwritten
  await reset();
  const damaged = backupFile();
  damaged.data.sessions.push(null, 42, "junk");
  damaged.data.hands = [{ id: 1, title: "good hand" }, null];
  await upload(damaged);
  const c = dialogs.find((d) => d.type === "confirm");
  assert.ok(c && /Skipped 4 damaged records \(sessions, hands\)/.test(c.message), c && c.message);
  assert.deepEqual(await names(), ["from backup"]);
  assert.deepEqual(await page.evaluate(() => hands.map((h) => h.title)), ["good hand"]);
  ok("damaged records are skipped and named in the confirmation; the good ones restore");

  // 7. after all that the app still works and nothing threw
  await page.evaluate(() => switchGroup("home"));
  assert.deepEqual(realErrors(), []);
  ok("no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
