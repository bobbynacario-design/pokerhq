"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../js/data/merge.js");

const ids = (list) => list.map((r) => r.id);
const rec = (id, extra) => Object.assign({id, v: 1}, extra || {});

// ───────────────────────── pure merge ─────────────────────────

test("hash ignores property order but sees real edits", () => {
  assert.equal(M.hashRecord({a: 1, b: {x: 1, y: 2}}), M.hashRecord({b: {y: 2, x: 1}, a: 1}));
  assert.notEqual(M.hashRecord({a: 1}), M.hashRecord({a: 2}));
  assert.notEqual(M.hashRecord({a: 1}), M.hashRecord({a: 1, b: 0}));
});

test("recordKeys: id-based, content-based for id-less, duplicates never collapse", () => {
  const list = [rec(1), rec(1, {v: 2}), {name: "no id"}, rec("7")];
  const keys = M.recordKeys(list);
  assert.equal(new Set(keys).size, 4);
  assert.equal(keys[0], "i:1");
  assert.equal(keys[1], "i:1#2");
  assert.ok(keys[2].startsWith("h:"));
  assert.equal(keys[3], "i:7");
});

test("no base: union — local-only kept, remote-only added, shared record follows preference", () => {
  const local = [rec(1, {v: "L"}), rec(2)];
  const remote = [rec(1, {v: "R"}), rec(3)];
  const ingested = M.merge(null, local, remote, {preferLocalWithoutBase: false});
  assert.deepEqual(ids(ingested).sort(), [1, 2, 3]);
  assert.equal(ingested.find((r) => r.id === 1).v, "R");
  const pushed = M.merge(null, local, remote, {preferLocalWithoutBase: true});
  assert.equal(pushed.find((r) => r.id === 1).v, "L");
});

test("both sides add different records: both survive", () => {
  const base = M.hashes([rec(1)]);
  const merged = M.merge(base, [rec(2), rec(1)], [rec(3), rec(1)]);
  assert.deepEqual(ids(merged).sort(), [1, 2, 3]);
});

test("edits: local edit wins, untouched local takes the remote edit, both edited → local", () => {
  const original = [rec(1), rec(2), rec(3)];
  const base = M.hashes(original);
  const local = [rec(1, {v: "local"}), rec(2), rec(3, {v: "local3"})];
  const remote = [rec(1), rec(2, {v: "remote"}), rec(3, {v: "remote3"})];
  const merged = M.merge(base, local, remote);
  assert.equal(merged.find((r) => r.id === 1).v, "local");
  assert.equal(merged.find((r) => r.id === 2).v, "remote");
  assert.equal(merged.find((r) => r.id === 3).v, "local3");
});

test("deletes propagate both ways when the other side did not touch the record", () => {
  const base = M.hashes([rec(1), rec(2), rec(3)]);
  // I deleted 2, cloud still has it unchanged
  assert.deepEqual(ids(M.merge(base, [rec(1), rec(3)], [rec(1), rec(2), rec(3)])), [1, 3]);
  // cloud deleted 3, I still have it unchanged
  assert.deepEqual(ids(M.merge(base, [rec(1), rec(2), rec(3)], [rec(1), rec(2)])), [1, 2]);
});

test("an edit beats a delete on either side", () => {
  const base = M.hashes([rec(1), rec(2)]);
  // I edited 2, cloud deleted it → keep my edit
  const a = M.merge(base, [rec(1), rec(2, {v: "mine"})], [rec(1)]);
  assert.deepEqual(ids(a), [1, 2]);
  assert.equal(a[1].v, "mine");
  // I deleted 2, cloud edited it → keep the cloud's edit
  const b = M.merge(base, [rec(1)], [rec(1), rec(2, {v: "theirs"})]);
  assert.deepEqual(ids(b), [1, 2]);
  assert.equal(b[1].v, "theirs");
});

test("duplicate ids are preserved, not collapsed", () => {
  const list = [rec(5, {v: "a"}), rec(5, {v: "b"}), rec(6)];
  const merged = M.merge(M.hashes(list), list, list);
  assert.equal(merged.length, 3);
  const withNew = M.merge(M.hashes(list), list.concat([rec(5, {v: "c"})]), list);
  assert.equal(withNew.length, 4);
});

test("id-less records merge by content", () => {
  const a = {name: "villain A"}, b = {name: "villain B"};
  const base = M.hashes([a]);
  const merged = M.merge(base, [a, b], [a, {name: "villain C"}]);
  assert.deepEqual(merged.map((r) => r.name).sort(), ["villain A", "villain B", "villain C"]);
});

test("ordering: a new local record stays at the front of a newest-first list", () => {
  const base = M.hashes([rec(3), rec(2), rec(1)]);
  const merged = M.merge(base, [rec(4), rec(3), rec(2), rec(1)], [rec(3), rec(2), rec(1)]);
  assert.deepEqual(ids(merged), [4, 3, 2, 1]);
});

test("ordering: a record added elsewhere lands where the cloud put it; local additions keep their neighbours", () => {
  const base = M.hashes([rec(3), rec(1)]);
  const merged = M.merge(base, [rec(9), rec(3), rec(1)], [rec(5), rec(3), rec(1)]);
  assert.deepEqual(ids(merged), [5, 9, 3, 1]);
});

test("ordering: consecutive local additions keep their relative order", () => {
  const base = M.hashes([rec(1)]);
  const merged = M.merge(base, [rec(12), rec(11), rec(1)], [rec(1), rec(20)]);
  const order = ids(merged);
  assert.ok(order.indexOf(12) < order.indexOf(11), order.join());
  assert.ok(order.indexOf(11) < order.indexOf(1), order.join());
  assert.equal(order.length, 4);
});

test("merge is idempotent and stable when nothing changed", () => {
  const list = [rec(2), rec(1)];
  const base = M.hashes(list);
  assert.deepEqual(M.merge(base, list, list), list);
  const m1 = M.merge(base, [rec(3), rec(2), rec(1)], list);
  const m2 = M.merge(M.hashes(m1), m1, m1);
  assert.deepEqual(m2, m1);
});

test("garbage inputs never throw", () => {
  assert.deepEqual(M.merge(null, null, null), []);
  assert.deepEqual(ids(M.merge(undefined, [rec(1)], undefined)), [1]);
  assert.deepEqual(ids(M.merge({}, undefined, [rec(1)])), [1]);
});

// ─────────────── multi-device simulation against the real engine ───────────────

// A tiny fake "cloud" plus devices that each run their own engine instance.
function makeCloud() {
  const docs = new Map();
  const devices = [];
  const stats = {transactions: 0, writes: 0, plainWrites: 0};
  const locks = new Map();

  async function withLock(key, fn) {
    while (locks.get(key)) await locks.get(key);
    let release;
    locks.set(key, new Promise((r) => { release = r; }));
    try { return await fn(); } finally { locks.delete(key); release(); }
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function broadcast(key) {
    devices.forEach((d) => { if (d.online) d.receive(key); });
  }

  const cloud = {
    docs, stats,
    read: (key) => (docs.has(key) ? JSON.parse(docs.get(key)) : undefined),
    device(name, mergeKeys) {
      const d = {
        name, online: true, local: {}, base: {}, failures: [], applied: 0, statuses: [],
        engine: null,
        receive(key) { // realtime snapshot
          setTimeout(() => { if (d.online) d.engine.ingest(key, cloud.read(key)); }, 0);
        },
        goOffline() { d.online = false; },
        goOnline() { d.online = true; },
        edit(key, fn) { d.local[key] = fn(d.local[key] || []); return d.engine.push(key, d.local[key]); },
        initialLoad(key) { const v = cloud.read(key); if (v !== undefined) d.engine.ingest(key, v); },
      };
      d.engine = M.createEngine({
        mergeKeys: mergeKeys || ["sessions", "hands"],
        io: {
          async transact(key, fn) {
            if (!d.online) throw new Error("offline");
            await tick();
            return withLock(key, async () => {
              stats.transactions++;
              await tick();
              const remote = docs.has(key) ? JSON.parse(docs.get(key)) : undefined;
              const r = fn(remote);
              if (r.write) { docs.set(key, JSON.stringify(r.value)); stats.writes++; broadcast(key); }
              return JSON.parse(JSON.stringify(r.value));
            });
          },
          async write(key, value) {
            if (!d.online) throw new Error("offline");
            await tick();
            stats.plainWrites++;
            docs.set(key, JSON.stringify(value));
            broadcast(key);
          },
        },
        store: {
          getLocal: (key) => d.local[key],
          applyLocal: (key, value) => { d.local[key] = JSON.parse(JSON.stringify(value)); d.applied++; },
          readBase: (key) => (d.base[key] === undefined ? null : d.base[key]),
          writeBase: (key, map) => { d.base[key] = map; },
        },
        isDemo: () => !!d.demo,
        onStatus: (s) => d.statuses.push(s),
        onFailure: (key, data) => d.failures.push({key, data}),
      });
      devices.push(d);
      return d;
    },
    async settle() { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 2)); },
  };
  return cloud;
}

test("HEADLINE: offline phone + desktop edits — nothing is lost after reconnect", async () => {
  const cloud = makeCloud();
  const desktop = cloud.device("desktop");
  const phone = cloud.device("phone");
  // both start in sync with one session
  await desktop.edit("sessions", () => [rec(1, {name: "Sunday Main"})]);
  await cloud.settle();
  assert.deepEqual(ids(phone.local.sessions), [1]);

  // phone loses signal at the table and logs a session (would have overwritten the cloud before)
  phone.goOffline();
  phone.local.sessions = [rec(3, {name: "Late night turbo"})].concat(phone.local.sessions);
  const parked = phone.local.sessions.slice();   // what the app's offline queue would hold

  // meanwhile the desktop logs another one
  await desktop.edit("sessions", (l) => [rec(2, {name: "Metro Saturday"})].concat(l));
  await cloud.settle();

  // phone reconnects: the app flushes its queue (a push of the parked list)
  phone.goOnline();
  await phone.engine.push("sessions", parked);
  await cloud.settle();

  const final = cloud.read("sessions");
  assert.deepEqual(ids(final).sort(), [1, 2, 3], "cloud has all three");
  assert.deepEqual(ids(desktop.local.sessions).sort(), [1, 2, 3], "desktop sees the phone's session");
  assert.deepEqual(ids(phone.local.sessions).sort(), [1, 2, 3], "phone sees the desktop's session");
});

test("deletes stay deleted while unrelated edits from a stale device survive", async () => {
  const cloud = makeCloud();
  const desktop = cloud.device("desktop");
  const phone = cloud.device("phone");
  await desktop.edit("sessions", () => [rec(3), rec(2), rec(1)]);
  await cloud.settle();

  phone.goOffline();
  phone.local.sessions = phone.local.sessions.map((s) => (s.id === 1 ? Object.assign({}, s, {notes: "edited offline"}) : s));
  const parked = phone.local.sessions.slice();

  await desktop.edit("sessions", (l) => l.filter((s) => s.id !== 2));   // delete 2
  await cloud.settle();

  phone.goOnline();
  await phone.engine.push("sessions", parked);
  await cloud.settle();

  const final = cloud.read("sessions");
  assert.deepEqual(ids(final).sort(), [1, 3], "deleted record did not come back");
  assert.equal(final.find((s) => s.id === 1).notes, "edited offline");
  assert.deepEqual(ids(phone.local.sessions).sort(), [1, 3]);
  assert.deepEqual(ids(desktop.local.sessions).sort(), [1, 3]);
});

test("a restore (overwrite) replaces the cloud copy and other devices drop the removed records", async () => {
  const cloud = makeCloud();
  const desktop = cloud.device("desktop");
  const phone = cloud.device("phone");
  await desktop.edit("sessions", () => [rec(4), rec(3), rec(2), rec(1)]);
  await cloud.settle();
  assert.deepEqual(ids(phone.local.sessions), [4, 3, 2, 1]);

  // desktop restores an old backup containing only 1 and 2
  desktop.local.sessions = [rec(2), rec(1)];
  await desktop.engine.push("sessions", desktop.local.sessions, {overwrite: true});
  await cloud.settle();

  assert.deepEqual(ids(cloud.read("sessions")), [2, 1], "cloud replaced, not merged");
  assert.deepEqual(ids(phone.local.sessions), [2, 1], "phone dropped 3 and 4");
  assert.equal(cloud.stats.plainWrites, 1);
});

test("a failed push parks only the latest data, and the retry merges cleanly", async () => {
  const cloud = makeCloud();
  const desktop = cloud.device("desktop");
  const phone = cloud.device("phone");
  await desktop.edit("sessions", () => [rec(1)]);
  await cloud.settle();

  phone.goOffline();   // engine.push will fail (transient error while believed online)
  const p1 = phone.edit("sessions", (l) => [rec(2)].concat(l));
  const p2 = phone.edit("sessions", (l) => [rec(3)].concat(l));
  await Promise.all([p1, p2]);
  assert.equal(phone.failures.length >= 1, true);
  const last = phone.failures[phone.failures.length - 1];
  assert.deepEqual(ids(last.data).sort(), [1, 2, 3], "the parked copy is the newest state, not a stale one");
  assert.ok(phone.statuses.includes("error"));
  assert.equal(phone.statuses[phone.statuses.length - 1], "error", "final status stays 'error', not 'ok'");

  await desktop.edit("sessions", (l) => [rec(9)].concat(l));
  await cloud.settle();

  phone.goOnline();
  await phone.engine.push("sessions", last.data);   // the app's queue flush
  await cloud.settle();
  assert.deepEqual(ids(cloud.read("sessions")).sort(), [1, 2, 3, 9]);
  assert.equal(phone.statuses[phone.statuses.length - 1], "ok");
});

test("rapid saves coalesce: few transactions, nothing lost", async () => {
  const cloud = makeCloud();
  const d = cloud.device("desktop");
  const pushes = [];
  for (let i = 1; i <= 8; i++) pushes.push(d.edit("sessions", (l) => [rec(i)].concat(l)));
  await Promise.all(pushes);
  await cloud.settle();
  assert.equal(cloud.read("sessions").length, 8);
  assert.ok(cloud.stats.transactions <= 3, "coalesced into " + cloud.stats.transactions + " transactions");
});

test("both devices saving at the same moment converge on the union", async () => {
  const cloud = makeCloud();
  const a = cloud.device("a");
  const b = cloud.device("b");
  await a.edit("sessions", () => [rec(1)]);
  await cloud.settle();
  await Promise.all([
    a.edit("sessions", (l) => [rec(2)].concat(l)),
    b.edit("sessions", (l) => [rec(3)].concat(l)),
  ]);
  await cloud.settle();
  assert.deepEqual(ids(cloud.read("sessions")).sort(), [1, 2, 3]);
  assert.deepEqual(ids(a.local.sessions).sort(), [1, 2, 3]);
  assert.deepEqual(ids(b.local.sessions).sort(), [1, 2, 3]);
});

test("upgrade path: a device with no base keeps its local-only records and gets the cloud's", async () => {
  const cloud = makeCloud();
  const desktop = cloud.device("desktop");
  await desktop.edit("sessions", () => [rec(1), rec(2)]);
  await cloud.settle();

  const oldPhone = cloud.device("oldPhone");            // never synced under the new code: no base
  oldPhone.local.sessions = [rec(1), rec(9, {name: "only on this phone"})];
  oldPhone.engine.ingest("sessions", cloud.read("sessions"));   // first load after upgrade
  await cloud.settle();

  assert.deepEqual(ids(cloud.read("sessions")).sort(), [1, 2, 9], "local-only record was uploaded");
  assert.deepEqual(ids(oldPhone.local.sessions).sort(), [1, 2, 9]);
  assert.deepEqual(ids(desktop.local.sessions).sort(), [1, 2, 9]);
});

test("ingest keeps unsaved local edits and pushes them instead of dropping them", async () => {
  const cloud = makeCloud();
  const desktop = cloud.device("desktop");
  const phone = cloud.device("phone");
  await desktop.edit("sessions", () => [rec(1)]);
  await cloud.settle();

  // the phone made an edit but the page closed before it saved; it is still in local storage
  phone.local.sessions = [rec(2, {name: "unsaved"}), rec(1)];
  phone.engine.ingest("sessions", cloud.read("sessions"));   // next launch loads the cloud copy
  await cloud.settle();

  assert.deepEqual(ids(phone.local.sessions).sort(), [1, 2], "not wiped by the incoming copy");
  assert.deepEqual(ids(cloud.read("sessions")).sort(), [1, 2], "and now saved to the cloud");
});

test("non-list keys stay last-write-wins and ingest straight through", async () => {
  const cloud = makeCloud();
  const a = cloud.device("a");
  const b = cloud.device("b");
  await a.engine.push("bankroll", {amount: 5000, rule: 5});
  await cloud.settle();
  assert.deepEqual(cloud.read("bankroll"), {amount: 5000, rule: 5});
  assert.deepEqual(b.local.bankroll, {amount: 5000, rule: 5});
  assert.equal(cloud.stats.transactions, 0, "no transaction needed for plain values");
});

test("demo mode: nothing is written and no incoming data is merged", async () => {
  const cloud = makeCloud();
  const real = cloud.device("real");
  await real.edit("sessions", () => [rec(1)]);
  await cloud.settle();

  const demo = cloud.device("demo");
  demo.local.sessions = [rec(9001, {name: "demo"})];
  demo.demo = true;
  await demo.engine.push("sessions", demo.local.sessions);
  demo.engine.ingest("sessions", cloud.read("sessions"));
  await cloud.settle();
  assert.deepEqual(ids(cloud.read("sessions")), [1], "demo data never reached the cloud");
  assert.deepEqual(ids(demo.local.sessions), [9001], "demo view left intact");
});

test("an unchanged save writes nothing (no-op transactions are read-only)", async () => {
  const cloud = makeCloud();
  const d = cloud.device("d");
  await d.edit("sessions", () => [rec(1)]);
  await cloud.settle();
  const writes = cloud.stats.writes;
  await d.engine.push("sessions", d.local.sessions);
  await cloud.settle();
  assert.equal(cloud.stats.writes, writes);
});

test("a synchronous throw from the I/O layer is handled like a failed save", async () => {
  const failures = [];
  const engine = M.createEngine({
    mergeKeys: ["sessions"],
    io: { transact() { throw new Error("sync boom"); }, write() { throw new Error("sync boom"); } },
    store: { getLocal: () => [], applyLocal() {}, readBase: () => null, writeBase() {} },
    onFailure: (key, data) => failures.push({key, data}),
  });
  await engine.push("sessions", [rec(1)]);
  assert.equal(failures.length, 1);
  assert.deepEqual(ids(failures[0].data), [1]);
});
