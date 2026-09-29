"use strict";

// Pure helpers for the weekly server-side backup (pokerhqWeeklyBackup in
// index.js). No Firebase imports here so the logic is unit-testable — see
// tests/backup.test.js.
//
// The file written is the SAME format as the app's JSON BACKUP button
// (js/features/library.js getBackupSnapshot), so a backup pulled from Cloud
// Storage can be loaded with RESTORE JSON in the app as-is.

const crypto = require("crypto");

// Mirrors FIRESTORE_KEYS in js/data/config.js. Each value is the default the
// app's backup uses when a document doesn't exist yet.
const BACKUP_DEFAULTS = {
  sessions: () => [],
  tourneys: () => [],
  hands: () => [],
  strategies: () => [],
  news: () => [],
  spotlights: () => [],
  bankroll: () => ({amount: 0, rule: 15}),
  wallet: () => ({balance: 0}),
  walletLedger: () => [],
  satellites: () => [],
  satTarget: () => ({name: "", buyin: 0}),
  opponents: () => [],
  goals: () => ({}),
  reminderSettings: () => ({}),
  timer: () => null,
};
const BACKUP_KEYS = Object.keys(BACKUP_DEFAULTS);

const BACKUP_PREFIX = "pokerhq-backups/weekly/";
const BACKUP_FILE_RE = /PokerHQ_Backup_(\d{4}-\d{2}-\d{2})\.json$/;
const DEFAULT_KEEP = 8;

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// App docs are stored as { value: JSON.stringify(data), updated }.
// Anything unreadable or of the wrong shape falls back to the default rather
// than poisoning the backup.
function parseDocValue(key, docData) {
  const fallback = BACKUP_DEFAULTS[key]();
  if (!docData || typeof docData.value !== "string") return fallback;
  let parsed;
  try {
    parsed = JSON.parse(docData.value);
  } catch (e) {
    return fallback;
  }
  if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
  if (fallback === null) return parsed === null || isPlainObject(parsed) ? parsed : fallback;
  return isPlainObject(parsed) ? parsed : fallback;
}

// docsByKey: { sessions: <doc data or undefined>, ... }
function buildBackupData(docsByKey) {
  const data = {};
  BACKUP_KEYS.forEach((key) => {
    data[key] = parseDocValue(key, docsByKey ? docsByKey[key] : undefined);
  });
  return data;
}

function buildBackupPayload(data, opts) {
  const o = opts || {};
  return {
    app: "PokerHQ",
    format: "backup",
    version: 1,
    exportedAt: (o.now || new Date()).toISOString(),
    source: "server-weekly",
    profile: o.profile || null,
    data,
  };
}

// A profile with nothing in it must never become a backup: if the cloud data
// were ever wiped, a weekly snapshot of the empty state would otherwise rotate
// the last good copies out.
function isEmptyBackupData(data) {
  if (!data) return true;
  const recordKeys = ["sessions", "hands", "tourneys", "strategies", "news", "spotlights",
    "walletLedger", "satellites", "opponents"];
  const hasRecords = recordKeys.some((k) => Array.isArray(data[k]) && data[k].length > 0);
  const hasMoney = (isPlainObject(data.bankroll) && Number(data.bankroll.amount) > 0) ||
    (isPlainObject(data.wallet) && Number(data.wallet.balance) > 0);
  return !hasRecords && !hasMoney;
}

// Stable hash of the data alone (not the timestamp), used to skip a week whose
// data is identical to the newest backup — so retention counts distinct versions.
function hashBackupData(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function ymdInManila(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function backupFileName(date) {
  return BACKUP_PREFIX + "PokerHQ_Backup_" + ymdInManila(date) + ".json";
}

function backupDateOf(name) {
  const m = BACKUP_FILE_RE.exec(String(name || ""));
  return m ? m[1] : null;
}

// Newest first, ignoring files that don't look like our backups.
function sortBackupNames(names) {
  return (names || [])
    .filter((n) => backupDateOf(n))
    .sort((a, b) => backupDateOf(b).localeCompare(backupDateOf(a)));
}

// Names to delete so only the newest `keep` remain. Never touches anything that
// isn't a recognised backup file.
function selectBackupsToDelete(names, keep) {
  const limit = Math.max(1, keep === undefined ? DEFAULT_KEEP : keep);
  return sortBackupNames(names).slice(limit);
}

module.exports = {
  BACKUP_KEYS,
  BACKUP_PREFIX,
  DEFAULT_KEEP,
  parseDocValue,
  buildBackupData,
  buildBackupPayload,
  isEmptyBackupData,
  hashBackupData,
  backupFileName,
  backupDateOf,
  sortBackupNames,
  selectBackupsToDelete,
};
