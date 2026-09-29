"use strict";
// Runs the REAL js/data/sync.js in Node against an in-memory Firestore fake
// (tests/fakes). Covers the glue the engine tests can't: the Firestore
// transaction wrapper, the base map in localStorage, window/localStorage
// application, parallel initial load, overwrite mode and demo-mode guards.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {pathToFileURL} = require("node:url");
const {register} = require("node:module");

// ── browser-ish globals sync.js expects ──
const store = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.document = {getElementById: () => null};
Object.defineProperty(globalThis, "navigator", {value: {onLine: true}, configurable: true, writable: true});
require("../js/data/util.js");
require("../js/data/merge.js");

register(pathToFileURL(path.join(__dirname, "fakes", "hooks.mjs")).href);

const PATH = "pokerhq-bob";
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const rec = (id, extra) => Object.assign({id, v: 1}, extra || {});
const ids = (l) => l.map((r) => r.id).sort((a, b) => a - b);
let cloud;
const cloudRead = (key) => { const d = cloud.docs.get(PATH + "/" + key); return d ? JSON.parse(d.value) : undefined; };
const cloudWrite = (key, value) => { // "another device" writes straight to the cloud
  cloud.docs.set(PATH + "/" + key, {value: JSON.stringify(value), updated: Date.now()});
  (cloud.listeners.get(PATH + "/" + key) || []).forEach((cb) => setTimeout(() => cb({exists: () => true, data: () => cloud.docs.get(PATH + "/" + key)}), 0));
};

let sync;
test.before(async () => {
  // simulated app state that sync.js writes into
  window.sessions = []; window.hands = []; window.tourneys = []; window.bankroll = {amount: 0, rule: 5};
  window.syncGlobalAliases = () => {};
  const url = pathToFileURL(path.join(__dirname, "..", "js", "data", "sync.js")).href;
  sync = await import(url);
  cloud = globalThis.__cloud;
  sync.initSync();
  globalThis.__authCallback({uid: "u1", email: "bobbynacario@gmail.com", isAnonymous: false});
  await settle(60);
});

test("initial load applies cloud data to window + localStorage, and records the base", async () => {
  // (nothing in the cloud yet; another device writes)
  cloudWrite("sessions", [rec(2), rec(1)]);
  await settle();
  assert.deepEqual(ids(window.sessions), [1, 2]);
  assert.deepEqual(ids(JSON.parse(localStorage.getItem("pokerhq_sessions"))), [1, 2]);
  const base = JSON.parse(localStorage.getItem("pokerhq_syncbase_sessions"));
  assert.deepEqual(Object.keys(base).sort(), ["i:1", "i:2"]);
});

test("a local save merges with what another device added meanwhile (transaction path)", async () => {
  // this device adds 3 locally; meanwhile another device added 9 to the cloud (not yet seen here)
  window.sessions = [rec(3)].concat(window.sessions);
  cloud.docs.set(PATH + "/sessions", {value: JSON.stringify([rec(9), rec(2), rec(1)]), updated: 1}); // silent write: no snapshot
  const before = cloud.stats.transactions;
  await window.fbSave("sessions", window.sessions);
  await settle();
  assert.equal(cloud.stats.transactions, before + 1, "used a transaction");
  assert.deepEqual(ids(cloudRead("sessions")), [1, 2, 3, 9], "cloud has both devices' records");
  assert.deepEqual(ids(window.sessions), [1, 2, 3, 9], "this device picked up the other device's record");
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem("pokerhq_syncbase_sessions"))).sort(), ["i:1", "i:2", "i:3", "i:9"]);
});

test("realtime snapshots from another device merge in and keep unsaved local edits", async () => {
  window.sessions = [rec(50, {name: "unsaved local"})].concat(window.sessions);   // not pushed yet
  cloudWrite("sessions", [rec(60)].concat(cloudRead("sessions")));                // another device adds 60
  await settle(80);
  assert.ok(ids(window.sessions).includes(50), "unsaved local record survived the incoming snapshot");
  assert.ok(ids(window.sessions).includes(60), "remote record arrived");
  assert.ok(ids(cloudRead("sessions")).includes(50), "and the unsaved record was pushed up");
});

test("old sessions mis-tagged 'final' are repaired as they arrive", async () => {
  cloudWrite("sessions", [{id: 777, prize: 5000, position: 0, result: "final", pnl: 1, total: 1}].concat(cloudRead("sessions")));
  await settle(60);
  assert.equal(window.sessions.find((s) => s.id === 777).result, "itm");
});

test("non-list keys are plain last-write-wins (no transaction)", async () => {
  const before = cloud.stats.transactions, sets = cloud.stats.sets;
  window.bankroll = {amount: 12345, rule: 5};
  await window.fbSave("bankroll", window.bankroll);
  await settle();
  assert.equal(cloud.stats.transactions, before);
  assert.equal(cloud.stats.sets, sets + 1);
  assert.deepEqual(cloudRead("bankroll"), {amount: 12345, rule: 5});
});

test("overwrite mode replaces the cloud list and other records vanish locally after ingest", async () => {
  window.sessions = [rec(1)];
  const txBefore = cloud.stats.transactions;
  await window.fbSave("sessions", window.sessions, {overwrite: true});
  await settle(80);
  assert.equal(cloud.stats.transactions, txBefore, "no merge transaction for an overwrite");
  assert.deepEqual(ids(cloudRead("sessions")), [1], "cloud list replaced, extras removed");
  assert.deepEqual(ids(window.sessions), [1]);
});

test("a failed write goes to the offline retry queue with the newest data", async () => {
  const queued = [];
  window.queueFailedSave = (key, data) => queued.push({key, data});
  window.sessions = [rec(1), rec(70)];
  cloud.failNext = Object.assign(new Error("unavailable"), {code: "unavailable"});
  await window.fbSave("sessions", window.sessions);
  await settle();
  assert.equal(queued.length, 1);
  assert.deepEqual(ids(queued[0].data), [1, 70]);
  // the retry (what flushOfflineQueue does) succeeds and the record lands
  await window.fbSave("sessions", queued[0].data);
  await settle();
  assert.ok(ids(cloudRead("sessions")).includes(70));
});

test("an unreadable cloud value is skipped, never wipes the local copy", async () => {
  window.sessions = [rec(1), rec(70)];
  cloud.docs.set(PATH + "/sessions", {value: "{not json", updated: 2});
  (cloud.listeners.get(PATH + "/sessions") || []).forEach((cb) => cb({exists: () => true, data: () => cloud.docs.get(PATH + "/sessions")}));
  await settle();
  assert.deepEqual(ids(window.sessions), [1, 70]);
});

test("fbLoadAll reads every key in parallel and applies them", async () => {
  cloudWrite("hands", [{id: 5, title: "AA vs KK"}]);
  cloudWrite("tourneys", [{id: 8, name: "Metro Main"}]);
  cloudWrite("sessions", [rec(1), rec(70)]);
  window.hands = []; window.tourneys = [];
  const gets = cloud.stats.gets;
  await sync.fbLoadAll();
  assert.equal(cloud.stats.gets - gets, 15, "one read per key");
  assert.equal(window.hands[0].title, "AA vs KK");
  assert.equal(window.tourneys[0].name, "Metro Main");
});

test("demo mode: saves and incoming data leave everything alone", async () => {
  const snapshotCloud = JSON.stringify(cloudRead("sessions"));
  window._demoMode = true;
  window.sessions = [rec(9001, {name: "demo"})];
  await window.fbSave("sessions", window.sessions);
  cloudWrite("sessions", JSON.parse(snapshotCloud).concat([rec(4242)]));
  await settle(60);
  assert.equal(JSON.stringify(cloudRead("sessions")), JSON.stringify(JSON.parse(snapshotCloud).concat([rec(4242)])), "cloud untouched by demo data");
  assert.deepEqual(ids(window.sessions), [9001], "demo view not overwritten");
  window._demoMode = false;
});

test("a list that outgrows the cloud limit says so, and isn't queued for endless retries", async () => {
  require("../js/data/util.js");   // exposes isCloudTooLargeError on window
  const queued = [];
  window.queueFailedSave = (key, data) => queued.push(key);
  window.sessions = [rec(1), rec(2)];
  cloud.failNext = Object.assign(new Error("Document cannot be written because its size (1,300,000 bytes) exceeds the maximum allowed size of 1,048,576 bytes."), {code: "invalid-argument"});
  await window.fbSave("sessions", window.sessions);
  await settle();
  assert.equal(window._syncMeta.status, "error");
  assert.equal(window._syncMeta.msg, "Too large to sync");
  assert.equal(window._syncMeta.tooLarge, "sessions");
  assert.deepEqual(queued, [], "not parked for retry — it would fail identically every time");

  // once it fits again the next save goes through and the warning clears
  await window.fbSave("sessions", window.sessions);
  await settle();
  assert.equal(window._syncMeta.status, "ok");
  assert.equal(window._syncMeta.tooLarge, undefined);

  // an ordinary failure afterwards is NOT mislabelled as 'too large'
  cloud.failNext = Object.assign(new Error("unavailable"), {code: "unavailable"});
  await window.fbSave("sessions", window.sessions);
  await settle();
  assert.equal(window._syncMeta.msg, "Save failed");
  assert.equal(queued.length, 1, "ordinary failures are still queued");
  await window.fbSave("sessions", window.sessions);   // recover for later tests
  await settle();
});
