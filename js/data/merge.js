"use strict";

// Record-level sync for PokerHQ's list-shaped data (sessions, hands, …).
//
// Every list used to be stored as ONE Firestore document and every save
// overwrote the whole list, so a stale device (say, a phone that was offline at
// the table) silently erased whatever another device had added meanwhile. This
// file makes saves merge instead:
//
//   • merge(base, local, remote)  — pure three-way merge keyed by record id.
//     `base` is a {recordKey: hash} map of what this device last saw in the
//     cloud, so "you deleted it" and "they added it" can be told apart.
//   • createEngine({io, store, …}) — the push/ingest logic with all I/O injected,
//     so js/data/sync.js only wires Firebase in and tests/merge.test.js can run
//     the real logic against several simulated devices.
//
// Loaded as a classic script (window.PokerHQMerge) and importable from Node.
// Conflict rules, in short: local unsaved edits win over remote copies of the
// same record; an edit beats a delete on either side; nothing is dropped just
// because another device hasn't seen it yet.
(function (root) {
  // ── hashing ─────────────────────────────────────────────────────────────
  // JSON with sorted keys, so property order never looks like an edit.
  function stableStringify(v) {
    if (v === null || typeof v !== "object") {
      var s = JSON.stringify(v);
      return s === undefined ? undefined : s;
    }
    if (Array.isArray(v)) {
      return "[" + v.map(function (x) {
        var t = stableStringify(x);
        return t === undefined ? "null" : t;
      }).join(",") + "]";
    }
    var parts = [];
    Object.keys(v).sort().forEach(function (k) {
      var t = stableStringify(v[k]);
      if (t !== undefined) parts.push(JSON.stringify(k) + ":" + t);
    });
    return "{" + parts.join(",") + "}";
  }

  // cyrb53 — small, fast, well-distributed 53-bit string hash (change detection,
  // not security).
  function cyrb53(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function hashRecord(rec) {
    var s = stableStringify(rec);
    return cyrb53(s === undefined ? "undefined" : s);
  }

  // Identity of each record: its id, or (for id-less records) its content.
  // Repeats of the same identity get "#2", "#3" … so nothing collapses.
  function recordKeys(list) {
    var seen = {};
    return list.map(function (rec) {
      var hasId = rec && typeof rec === "object" && rec.id !== undefined && rec.id !== null && rec.id !== "";
      var k = hasId ? "i:" + String(rec.id) : "h:" + hashRecord(rec);
      seen[k] = (seen[k] || 0) + 1;
      return seen[k] === 1 ? k : k + "#" + seen[k];
    });
  }

  // {recordKey: hash} — the compact "base" a device remembers between syncs.
  function hashes(list) {
    var arr = Array.isArray(list) ? list : [];
    var keys = recordKeys(arr);
    var out = {};
    arr.forEach(function (rec, i) { out[keys[i]] = hashRecord(rec); });
    return out;
  }

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function sameHashes(a, b) {
    var ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (var i = 0; i < ak.length; i++) {
      if (!hasOwn(b, ak[i]) || a[ak[i]] !== b[ak[i]]) return false;
    }
    return true;
  }

  // ── three-way merge ─────────────────────────────────────────────────────
  // base   {key: hash} | null  what this device last saw in the cloud
  // local   [record]           this device's current list
  // remote  [record]           the cloud's current list
  // opts.preferLocalWithoutBase: with no base, who wins a record present on both
  //   sides — true when PUSHING (the user just changed something), false when
  //   INGESTING a cloud copy.
  // Result order follows the cloud's order; records only this device has are
  // slotted in next to their local neighbours (new items stay at the front of
  // newest-first lists).
  function merge(base, local, remote, opts) {
    var preferLocal = !!(opts && opts.preferLocalWithoutBase);
    local = Array.isArray(local) ? local : [];
    remote = Array.isArray(remote) ? remote : [];
    var hasBase = !!base && typeof base === "object";

    var lk = recordKeys(local), rk = recordKeys(remote);
    var lInfo = {}, rInfo = {};
    local.forEach(function (rec, i) { lInfo[lk[i]] = { rec: rec, hash: hashRecord(rec) }; });
    remote.forEach(function (rec, i) { rInfo[rk[i]] = { rec: rec, hash: hashRecord(rec) }; });

    var out = [];           // [{k, rec}]
    var inOut = {};
    function put(k, rec) { out.push({ k: k, rec: rec }); inOut[k] = true; }

    // 1) everything the cloud has, in the cloud's order
    remote.forEach(function (r, i) {
      var k = rk[i], l = lInfo[k], rh = rInfo[k].hash;
      var known = hasBase && hasOwn(base, k);
      if (l) {
        if (known) put(k, l.hash !== base[k] ? l.rec : r);   // local edit wins, else take the cloud's
        else if (hasBase) put(k, l.rec);                    // new here, unsaved
        else put(k, preferLocal ? l.rec : r);
      } else if (known) {
        // deleted here — unless the cloud copy was edited since we last saw it
        if (rh !== base[k]) put(k, r);
      } else {
        put(k, r);                                          // new in the cloud
      }
    });

    // 2) records only this device has
    local.forEach(function (rec, i) {
      var k = lk[i];
      if (rInfo[k]) return;
      var known = hasBase && hasOwn(base, k);
      // known ⇒ the cloud deleted it: keep only if edited here since
      if (known && lInfo[k].hash === base[k]) return;

      var at = -1, j, idx;
      for (j = i + 1; j < local.length && at === -1; j++) {
        if (inOut[lk[j]]) at = indexOfKey(out, lk[j]);           // just before the next neighbour
      }
      if (at === -1) {
        for (j = i - 1; j >= 0 && at === -1; j--) {
          if (inOut[lk[j]]) { idx = indexOfKey(out, lk[j]); at = idx + 1; }  // just after the previous one
        }
      }
      if (at === -1) at = out.length;
      out.splice(at, 0, { k: k, rec: rec });
      inOut[k] = true;
    });

    return out.map(function (x) { return x.rec; });
  }

  function indexOfKey(out, k) {
    for (var i = 0; i < out.length; i++) if (out[i].k === k) return i;
    return -1;
  }

  // ── sync engine ─────────────────────────────────────────────────────────
  // cfg.mergeKeys : keys whose value is a record list (merged); others are
  //                 plain last-write-wins values
  // cfg.io        : { transact(key, fn) → Promise<committedValue>,
  //                   write(key, value) → Promise }
  //                 transact runs fn(remoteValue|undefined) atomically against
  //                 the cloud copy; fn returns {value, write}; the cloud copy is
  //                 replaced with `value` only if `write`; resolves with `value`.
  // cfg.store     : { getLocal(key), applyLocal(key, value),
  //                   readBase(key) → map|null, writeBase(key, map) }
  // cfg.isDemo()  : demo data must never be merged into or pushed from
  // cfg.onStatus(state, key), cfg.onError(key, err), cfg.onFailure(key, data)
  function createEngine(cfg) {
    var mergeKeys = {};
    (cfg.mergeKeys || []).forEach(function (k) { mergeKeys[k] = true; });
    var queues = {};

    function isMerge(key) { return mergeKeys[key] === true; }
    function isDemo() { return !!(cfg.isDemo && cfg.isDemo()); }
    function status(state, key) { if (cfg.onStatus) cfg.onStatus(state, key); }
    function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

    // A cloud copy arrived (snapshot, initial load, or our own commit): fold it
    // into local state without ever discarding unsaved local edits.
    function ingest(key, remote) {
      if (isDemo()) return false;
      if (!isMerge(key) || !Array.isArray(remote)) {
        cfg.store.applyLocal(key, remote);
        return false;
      }
      var local = cfg.store.getLocal(key);
      var merged = merge(cfg.store.readBase(key), Array.isArray(local) ? local : [], remote, { preferLocalWithoutBase: false });
      var remoteHashes = hashes(remote);
      cfg.store.writeBase(key, remoteHashes);
      cfg.store.applyLocal(key, merged);
      // Local-only changes the cloud hasn't got yet (e.g. edits made before the
      // page closed): send them now rather than waiting for the next edit.
      var ahead = !sameHashes(hashes(merged), remoteHashes);
      if (ahead) push(key, merged);
      return ahead;
    }

    function runJob(key, job) {
      if (job.overwrite || !isMerge(key)) {
        return cfg.io.write(key, job.data).then(function () {
          if (isMerge(key)) cfg.store.writeBase(key, hashes(job.data));
        });
      }
      return cfg.io.transact(key, function (remote) {
        var remoteList = Array.isArray(remote) ? remote : [];
        var merged = merge(cfg.store.readBase(key), job.data, remoteList, { preferLocalWithoutBase: true });
        var changed = !Array.isArray(remote) || !sameHashes(hashes(merged), hashes(remoteList));
        return { value: merged, write: changed };
      }).then(function (committed) {
        ingest(key, committed);
      });
    }

    function drain(key, q) {
      q.running = true;
      status("syncing", key);
      var lastFailed = false;
      function next() {
        if (!q.next) {
          q.running = false;
          status(lastFailed ? "error" : "ok", key);
          return Promise.resolve();
        }
        var job = q.next;
        q.next = null;
        // Promise.resolve().then(...) so a synchronous throw from the I/O layer
        // is handled like any other failure instead of escaping push().
        return Promise.resolve().then(function () { return runJob(key, job); }).then(function () {
          lastFailed = false;
          return next();
        }, function (err) {
          lastFailed = true;
          if (cfg.onError) cfg.onError(key, err);
          // Only park the data for a later retry if nothing newer is waiting —
          // a newer job carries the full current state and will retry itself.
          if (!q.next && cfg.onFailure) cfg.onFailure(key, job.data);
          return next();
        });
      }
      return next();
    }

    // Save `data` (the device's full current list/value) to the cloud.
    // Saves to the same key are serialized and coalesced: each carries the full
    // state, so only the newest waiting one needs to run.
    function push(key, data, opts) {
      if (isDemo()) return Promise.resolve();
      var q = queues[key] || (queues[key] = { running: false, next: null, done: Promise.resolve() });
      var overwrite = !!((opts && opts.overwrite) || (q.next && q.next.overwrite));
      q.next = { data: clone(data), overwrite: overwrite };
      if (!q.running) q.done = drain(key, q);
      return q.done;
    }

    return { push: push, ingest: ingest, isMerge: isMerge };
  }

  var api = {
    stableStringify: stableStringify,
    hashRecord: hashRecord,
    recordKeys: recordKeys,
    hashes: hashes,
    sameHashes: sameHashes,
    merge: merge,
    createEngine: createEngine
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQMerge = api;
})(typeof window !== "undefined" ? window : undefined);
