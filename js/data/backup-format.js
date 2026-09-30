"use strict";

// The backup file format: which version a file is, whether this app can read it,
// upgrading older files step by step, and dropping damaged records instead of
// letting them crash the app later. Pure functions, loaded as a classic script
// (window.PokerHQBackup) and importable from Node for tests/backup-format.test.js.
// Used by the JSON backup / restore in js/features/library.js.
(function (root) {
  var APP = "PokerHQ";
  var FORMAT = "backup";

  // Bump this when the shape of a backup changes, and add the step that upgrades
  // the previous version to MIGRATIONS below. The weekly server backup
  // (functions/backup.js) must write the same number; a test checks it.
  var CURRENT_VERSION = 1;

  // MIGRATIONS[n] takes the `data` of a version-n backup and returns the `data`
  // of version n+1 (it may change the object it is given: it works on a copy).
  // None yet: version 1 is the first format.
  var MIGRATIONS = {};

  var ARRAY_KEYS = ["sessions", "hands", "tourneys", "strategies", "news", "spotlights", "satellites", "opponents"];
  // walletLedger and the trip lists came after the first backups: an older file without them restores as empty lists
  var RECORD_LISTS = ARRAY_KEYS.concat(["walletLedger", "trips", "tripExpenses"]);

  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function clone(v, fallback) {
    try { return JSON.parse(JSON.stringify(typeof v === "undefined" ? fallback : v)); } catch (e) { return fallback; }
  }
  function util() {
    if (typeof module !== "undefined" && module.exports) { try { return require("./util.js"); } catch (e) { return {}; } }
    return root || {};
  }

  // A file without a version is one from before versions were checked: version 1.
  // Anything else must be a whole number >= 1.
  function readVersion(parsed) {
    if (!isObj(parsed) || typeof parsed.version === "undefined") return 1;
    var v = parsed.version;
    return typeof v === "number" && isFinite(v) && Math.floor(v) === v && v >= 1 ? v : null;
  }

  // Apply the upgrade steps from `from` up to `to`. Fails, without guessing, if a
  // step is missing.
  function runMigrations(data, from, to, table) {
    var steps = table || MIGRATIONS;
    var current = clone(data, {});
    for (var v = from; v < to; v++) {
      if (typeof steps[v] !== "function") {
        return { ok: false, message: "This backup is from an older format (v" + from + ") that this version of PokerHQ can no longer upgrade." };
      }
      try { current = steps[v](current); } catch (e) { current = null; }
      if (!isObj(current)) return { ok: false, message: "Upgrading this backup from format v" + v + " failed." };
    }
    return { ok: true, data: current };
  }

  // parsed: the JSON from a backup file. Returns {ok:false, message} or
  // {ok:true, version, migrated, data, notes, exportedAt, source}.
  // opts (tests only): {currentVersion, migrations}
  function parse(parsed, opts) {
    var o = opts || {};
    var current = o.currentVersion || CURRENT_VERSION;
    if (!isObj(parsed)) return { ok: false, message: "That file is not a valid PokerHQ backup object." };

    var wrapped = isObj(parsed.data);
    if (wrapped) {
      if (typeof parsed.app !== "undefined" && parsed.app !== APP) {
        return { ok: false, message: "That file is not a PokerHQ backup (it comes from \"" + String(parsed.app).slice(0, 40) + "\")." };
      }
      if (typeof parsed.format !== "undefined" && parsed.format !== FORMAT) {
        return { ok: false, message: "That file is not a PokerHQ backup file." };
      }
    }
    var version = readVersion(wrapped ? parsed : {});
    if (version === null) return { ok: false, message: "This backup has an unrecognised format version." };
    if (version > current) {
      return { ok: false, message: "This backup was made by a newer version of PokerHQ (backup format v" + version + "; this one reads up to v" + current + "). Reload PokerHQ to get the latest version, then try again." };
    }

    var source = wrapped ? parsed.data : parsed;   // older files were just the data object
    var notes = [];
    var migrated = false;
    if (version < current) {
      var up = runMigrations(source, version, current, o.migrations);
      if (!up.ok) return up;
      source = up.data;
      migrated = true;
      notes.push("Upgraded from backup format v" + version + " to v" + current + ".");
    }
    if (!isObj(source)) return { ok: false, message: "That file is not a valid PokerHQ backup object." };

    for (var i = 0; i < ARRAY_KEYS.length; i++) {
      if (!Array.isArray(source[ARRAY_KEYS[i]])) return { ok: false, message: "Backup is missing a valid \"" + ARRAY_KEYS[i] + "\" array." };
    }
    if (!isObj(source.bankroll)) return { ok: false, message: "Backup is missing a valid bankroll object." };
    if (!isObj(source.satTarget)) return { ok: false, message: "Backup is missing a valid satellite target object." };
    if (!(source.timer === null || typeof source.timer === "undefined" || isObj(source.timer))) return { ok: false, message: "Backup timer data is invalid." };
    // goals / reminderSettings / wallet / walletLedger were added after the first backups:
    // tolerate older files without them, but reject them if present and malformed.
    if (typeof source.goals !== "undefined" && !isObj(source.goals)) return { ok: false, message: "Backup goals data is invalid." };
    if (typeof source.reminderSettings !== "undefined" && !isObj(source.reminderSettings)) return { ok: false, message: "Backup reminder settings are invalid." };

    var data = {};
    var dropped = 0, droppedIn = [];
    RECORD_LISTS.forEach(function (key) {
      var list = Array.isArray(source[key]) ? source[key] : [];
      var kept = list.filter(isObj);
      if (kept.length !== list.length) { dropped += list.length - kept.length; droppedIn.push(key); }
      data[key] = clone(kept, []);
    });
    if (dropped) notes.push("Skipped " + dropped + " damaged record" + (dropped === 1 ? "" : "s") + " (" + droppedIn.join(", ") + ").");

    // Sessions saved by old versions had a couple of mis-tagged results; repair them the same way loading does.
    var u = util();
    if (typeof u.normalizeSessions === "function") {
      var fixed = u.normalizeSessions(data.sessions);
      if (fixed && fixed.changed) notes.push("Repaired some old session results.");
    }

    data.bankroll = clone(source.bankroll, { amount: 0, rule: 15 });
    if (!isFinite(Number(data.bankroll.amount))) { data.bankroll.amount = 0; notes.push("Reset an invalid bankroll amount to 0."); }
    data.wallet = isObj(source.wallet) ? clone(source.wallet, { balance: 0 }) : { balance: 0 };
    data.satTarget = clone(source.satTarget, { name: "", buyin: 0 });
    data.goals = isObj(source.goals) ? clone(source.goals, {}) : {};
    data.reminderSettings = isObj(source.reminderSettings) ? clone(source.reminderSettings, {}) : {};
    data.timer = typeof source.timer === "undefined" ? null : clone(source.timer, null);

    return {
      ok: true,
      version: version,
      migrated: migrated,
      data: data,
      notes: notes,
      exportedAt: wrapped && typeof parsed.exportedAt === "string" ? parsed.exportedAt : null,
      source: wrapped && typeof parsed.source === "string" ? parsed.source : null
    };
  }

  var api = {
    APP: APP,
    FORMAT: FORMAT,
    CURRENT_VERSION: CURRENT_VERSION,
    MIGRATIONS: MIGRATIONS,
    readVersion: readVersion,
    runMigrations: runMigrations,
    parse: parse
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQBackup = api;
})(typeof window !== "undefined" ? window : undefined);
