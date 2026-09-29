"use strict";
// The service worker's push handlers, run against a fake service-worker scope.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadSw() {
  const listeners = {};
  const shown = [];
  const opened = [];
  const focused = [];
  let windows = [];
  const self = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    registration: {scope: "https://example.github.io/pokerhq/", showNotification: (title, opts) => { shown.push({title, opts}); return Promise.resolve(); }},
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => { opened.push(url); },
      claim: () => Promise.resolve(),
    },
    skipWaiting() {},
    location: {origin: "https://example.github.io"},
  };
  const sandbox = {self, caches: {open: async () => ({addAll: async () => {}}), keys: async () => [], delete: async () => {}}, fetch: async () => ({}), URL, Promise, Response: {error: () => ({})}, console};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8"), sandbox);
  const waits = [];
  const fire = async (type, event) => { event.waitUntil = (p) => waits.push(p); listeners[type](event); await Promise.all(waits.splice(0)); };
  return {shown, opened, focused, fire, setWindows: (w) => { windows = w; }, listeners};
}

const pushEvent = (payload) => ({data: {json: () => payload, text: () => JSON.stringify(payload)}});

test("a push shows a notification with the server's title, body, tag and link", async () => {
  const sw = loadSw();
  await sw.fire("push", pushEvent({title: "Metro Main starts in 45 min", body: "7:00 PM · ₱3,300", tag: "start-1", url: "https://example.github.io/pokerhq/"}));
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, "Metro Main starts in 45 min");
  assert.equal(sw.shown[0].opts.body, "7:00 PM · ₱3,300");
  assert.equal(sw.shown[0].opts.tag, "start-1");
  assert.equal(sw.shown[0].opts.data.url, "https://example.github.io/pokerhq/");
  assert.match(sw.shown[0].opts.icon, /icon-192\.png$/);
});

test("browsers require every push to show something — even a malformed or empty one does", async () => {
  const sw = loadSw();
  await sw.fire("push", {data: {json: () => { throw new SyntaxError("bad json"); }, text: () => "plain text body"}});
  assert.equal(sw.shown.length, 1);
  assert.equal(sw.shown[0].title, "PokerHQ");
  assert.equal(sw.shown[0].opts.body, "plain text body");
  await sw.fire("push", {data: null});
  assert.equal(sw.shown.length, 2);
  assert.equal(sw.shown[1].title, "PokerHQ");
  await sw.fire("push", pushEvent({}));
  assert.equal(sw.shown.length, 3);
  assert.equal(sw.shown[2].opts.tag, "pokerhq");
});

test("tapping a notification focuses an open PokerHQ window instead of opening a second", async () => {
  const sw = loadSw();
  const focused = [];
  sw.setWindows([
    {url: "https://other.example/", focus: () => focused.push("other")},
    {url: "https://example.github.io/pokerhq/#calendar", focus: () => { focused.push("app"); return Promise.resolve(); }},
  ]);
  const closed = [];
  await sw.fire("notificationclick", {notification: {close: () => closed.push(1), data: {url: "https://example.github.io/pokerhq/"}}});
  assert.deepEqual(closed, [1], "notification dismissed");
  assert.deepEqual(focused, ["app"]);
  assert.deepEqual(sw.opened, []);
});

test("tapping a notification opens the app when it isn't open", async () => {
  const sw = loadSw();
  sw.setWindows([]);
  await sw.fire("notificationclick", {notification: {close() {}, data: {url: "https://example.github.io/pokerhq/"}}});
  assert.deepEqual(sw.opened, ["https://example.github.io/pokerhq/"]);
  await sw.fire("notificationclick", {notification: {close() {}, data: null}});
  assert.equal(sw.opened[1], "./", "falls back to the app root");
});

test("the existing shell behaviour is untouched: install, message, activate and fetch handlers still register", () => {
  const sw = loadSw();
  ["install", "message", "activate", "fetch", "push", "notificationclick"].forEach((t) => assert.equal(typeof sw.listeners[t], "function", t));
});
