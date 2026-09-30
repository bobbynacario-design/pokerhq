"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../functions/push.js");

// Manila is UTC+8: 19:00 Manila = 11:00Z.
const at = (iso) => new Date(iso);
const ev = (o) => Object.assign({id: 1, name: "Metro Sunday Main", venue: "Metro Card Club", buyin: 3300, date: "2026-10-04", time: "19:00", planning: true, status: "target"}, o || {});

// ── preferences ──
test("prefs default to everything on with a 60 minute lead", () => {
  assert.deepEqual(P.pushPrefs(undefined), {startAlerts: true, morning: true, leadMinutes: 60, hideAmounts: false});
  assert.deepEqual(P.pushPrefs({}), {startAlerts: true, morning: true, leadMinutes: 60, hideAmounts: false});
  assert.deepEqual(P.pushPrefs({pushStartAlerts: false, pushMorning: false, pushLeadMinutes: 30}), {startAlerts: false, morning: false, leadMinutes: 30, hideAmounts: false});
  assert.equal(P.pushPrefs({pushLeadMinutes: 45}).leadMinutes, 60, "only the offered choices are accepted");
  assert.equal(P.pushPrefs({pushLeadMinutes: "120"}).leadMinutes, 120);
});

// ── starting soon ──
test("starting soon: only planned events with a time, inside the lead window, in the future", () => {
  const now = at("2026-10-04T10:15:00Z");   // 18:15 Manila → 45 min before 19:00
  const due = P.selectStartingSoon({tourneys: [ev()], now, leadMinutes: 60});
  assert.equal(due.length, 1);
  assert.equal(due[0].minutes, 45);

  // too early / already started / not planned / no time / skipped-status but planned still counts
  assert.equal(P.selectStartingSoon({tourneys: [ev()], now: at("2026-10-04T08:00:00Z"), leadMinutes: 60}).length, 0, "3h away");
  assert.equal(P.selectStartingSoon({tourneys: [ev()], now: at("2026-10-04T11:00:00Z"), leadMinutes: 60}).length, 0, "exactly at start");
  assert.equal(P.selectStartingSoon({tourneys: [ev()], now: at("2026-10-04T11:30:00Z"), leadMinutes: 60}).length, 0, "already started");
  assert.equal(P.selectStartingSoon({tourneys: [ev({planning: false})], now, leadMinutes: 60}).length, 0);
  assert.equal(P.selectStartingSoon({tourneys: [ev({planning: undefined})], now, leadMinutes: 60}).length, 0);
  assert.equal(P.selectStartingSoon({tourneys: [ev({time: ""})], now, leadMinutes: 60}).length, 0);
  assert.equal(P.selectStartingSoon({tourneys: [ev({status: "skip"})], now, leadMinutes: 60}).length, 1, "you chose to play it");
});

test("starting soon: the lead window is respected and events sort soonest-first", () => {
  const now = at("2026-10-04T10:15:00Z");   // 18:15
  const near = ev({id: 1, time: "19:00"});
  const later = ev({id: 2, name: "Late Turbo", time: "20:00"});
  assert.deepEqual(P.selectStartingSoon({tourneys: [later, near], now, leadMinutes: 120}).map((d) => d.event.id), [1, 2]);
  assert.deepEqual(P.selectStartingSoon({tourneys: [later, near], now, leadMinutes: 60}).map((d) => d.event.id), [1], "20:00 is 105 min away");
  assert.deepEqual(P.selectStartingSoon({tourneys: [later, near], now, leadMinutes: 30}).map((d) => d.event.id), []);
});

test("starting soon: each event is alerted once", () => {
  const now = at("2026-10-04T10:15:00Z");
  const first = P.selectStartingSoon({tourneys: [ev()], now, leadMinutes: 60});
  const sent = {[first[0].key]: now.getTime()};
  assert.equal(P.selectStartingSoon({tourneys: [ev()], now: at("2026-10-04T10:30:00Z"), leadMinutes: 60, sent}).length, 0);
  // a different day's occurrence of the same event id is a new alert
  assert.equal(P.selectStartingSoon({tourneys: [ev({date: "2026-10-11"})], now: at("2026-10-11T10:15:00Z"), leadMinutes: 60, sent}).length, 1);
});

test("starting soon: an early-morning start counts against the Manila day, not the UTC day", () => {
  // 00:30 Manila on Oct 4 = 16:30Z on Oct 3
  const t = ev({time: "00:30"});
  const due = P.selectStartingSoon({tourneys: [t], now: at("2026-10-03T16:00:00Z"), leadMinutes: 60});
  assert.equal(due.length, 1);
  assert.equal(due[0].minutes, 30);
  assert.match(due[0].key, /\|2026-10-04$/);
});

test("starting soon tolerates junk in the list", () => {
  const now = at("2026-10-04T10:15:00Z");
  assert.doesNotThrow(() => P.selectStartingSoon({tourneys: [null, undefined, {}, "x", ev()], now}));
  assert.deepEqual(P.selectStartingSoon({}), []);
});

// ── morning digest ──
test("digest: only in the morning window, once a day, only today's non-skipped events", () => {
  const tourneys = [ev({id: 1, date: "2026-10-04", planning: false}), ev({id: 2, date: "2026-10-04", status: "skip", planning: false}), ev({id: 3, date: "2026-10-05"})];
  const morning = at("2026-10-04T01:30:00Z");   // 09:30 Manila
  const d = P.selectDigest({tourneys, now: morning});
  assert.equal(d.ymd, "2026-10-04");
  assert.deepEqual(d.events.map((e) => e.id), [1]);

  assert.equal(P.selectDigest({tourneys, now: at("2026-10-03T23:00:00Z")}), null, "07:00 Manila: too early");
  assert.equal(P.selectDigest({tourneys, now: at("2026-10-04T04:00:00Z")}), null, "12:00 Manila: too late");
  assert.equal(P.selectDigest({tourneys, now: morning, sentDigest: "2026-10-04"}), null, "already sent today");
  assert.ok(P.selectDigest({tourneys, now: morning, sentDigest: "2026-10-03"}), "yesterday's marker doesn't block today");
  assert.equal(P.selectDigest({tourneys: [ev({date: "2026-10-05"})], now: morning}), null, "nothing today, no digest");
  assert.equal(P.selectDigest({tourneys: [], now: morning}), null);
});

test("digest: planned events first, then by start time", () => {
  const tourneys = [
    ev({id: 1, time: "12:00", planning: false}),
    ev({id: 2, time: "20:00", planning: true}),
    ev({id: 3, time: "", planning: false}),
    ev({id: 4, time: "15:00", planning: true}),
  ];
  const d = P.selectDigest({tourneys, now: at("2026-10-04T01:30:00Z")});
  assert.deepEqual(d.events.map((e) => e.id), [4, 2, 1, 3]);
});

// ── message text ──
test("starting-soon message reads naturally", () => {
  const p = P.buildStartingSoonPayload(ev({gtd: "₱1M"}), 45);
  assert.equal(p.title, "Metro Sunday Main starts in 45 min");
  assert.equal(p.body, "7:00 PM · Metro Card Club · ₱3,300 · GTD ₱1M");
  assert.equal(p.tag, "start-1");
  assert.equal(p.kind, "start");
  assert.ok(p.url.startsWith("https://"));
  assert.equal(P.buildStartingSoonPayload(ev(), 90).title, "Metro Sunday Main starts in 1.5 h");
  assert.equal(P.buildStartingSoonPayload(ev(), 120).title, "Metro Sunday Main starts in 2 h");
  assert.equal(P.buildStartingSoonPayload(ev({venue: "", buyin: 0, time: "00:05"}), 10).body, "12:05 AM");
  assert.equal(P.buildStartingSoonPayload({id: 9, name: "X"}, 5).body, "Time to get ready.");
});

test("time labels", () => {
  assert.equal(P.timeLabel({time: "19:00"}), "7:00 PM");
  assert.equal(P.timeLabel({time: "12:00"}), "12:00 PM");
  assert.equal(P.timeLabel({time: "00:30"}), "12:30 AM");
  assert.equal(P.timeLabel({time: "09:05"}), "9:05 AM");
  assert.equal(P.timeLabel({}), "");
});

test("digest message: singular/plural, three lines, and a '+N more' tail", () => {
  const one = P.buildDigestPayload([ev()], "2026-10-04");
  assert.equal(one.title, "1 tournament today");
  assert.equal(one.body, "Metro Sunday Main (7:00 PM · ₱3,300)");
  assert.equal(one.tag, "digest-2026-10-04");
  const five = P.buildDigestPayload([1, 2, 3, 4, 5].map((id) => ev({id, name: "E" + id})), "2026-10-04");
  assert.equal(five.title, "5 tournaments today");
  assert.deepEqual(five.body.split("\n"), ["E1 (7:00 PM · ₱3,300)", "E2 (7:00 PM · ₱3,300)", "E3 (7:00 PM · ₱3,300)", "+2 more"]);
  assert.equal(P.buildDigestPayload([{id: 1}], "d").body, "Tournament");
});

test("pruneSent drops old markers only", () => {
  const now = Date.UTC(2026, 9, 4);
  const out = P.pruneSent({old: now - 20 * 86400000, recent: now - 86400000}, now);
  assert.deepEqual(Object.keys(out), ["recent"]);
  assert.deepEqual(P.pruneSent(undefined, now), {});
});

// ── subscriptions ──
const goodSub = (n) => ({endpoint: "https://fcm.googleapis.com/fcm/send/abc" + (n || ""), keys: {p256dh: "BNc_2mS-AbCdEf0123456789_-xyz", auth: "auth_123-abc"}});

test("subscription validation accepts real-shaped subscriptions and rejects the rest", () => {
  assert.equal(P.isValidSubscription(goodSub()), true);
  assert.equal(P.isValidSubscription(Object.assign(goodSub(), {expirationTime: null})), true);
  assert.equal(P.isValidSubscription({endpoint: "http://insecure.example/x", keys: goodSub().keys}), false, "https only");
  assert.equal(P.isValidSubscription({endpoint: "not a url", keys: goodSub().keys}), false);
  assert.equal(P.isValidSubscription({endpoint: goodSub().endpoint}), false, "keys required");
  assert.equal(P.isValidSubscription({endpoint: goodSub().endpoint, keys: {p256dh: "x!!", auth: "y"}}), false, "keys must be base64url");
  assert.equal(P.isValidSubscription({endpoint: "https://x.example/" + "a".repeat(1600), keys: goodSub().keys}), false, "absurdly long endpoint");
  assert.equal(P.isValidSubscription(null), false);
  assert.equal(P.isValidSubscription("str"), false);
});

test("subscription ids are stable, safe as Firestore field names, and distinct", () => {
  const a = P.subscriptionId(goodSub("1").endpoint), b = P.subscriptionId(goodSub("2").endpoint);
  assert.equal(a, P.subscriptionId(goodSub("1").endpoint));
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{24}$/);
});

test("upsert: adds a device, replaces the same device, keeps its first-seen time", () => {
  const first = P.upsertSubscription({}, goodSub("1"), "iPhone", 1000);
  const id = P.subscriptionId(goodSub("1").endpoint);
  assert.equal(first.subscriptions[id].device, "iPhone");
  assert.equal(first.subscriptions[id].created, 1000);
  const again = P.upsertSubscription(first.subscriptions, goodSub("1"), "iPhone (renamed)", 5000);
  assert.equal(Object.keys(again.subscriptions).length, 1);
  assert.equal(again.subscriptions[id].created, 1000);
  assert.equal(again.subscriptions[id].updated, 5000);
  assert.equal(again.subscriptions[id].device, "iPhone (renamed)");
});

test("upsert: never keeps more than the device limit, evicting the oldest", () => {
  let subs = {};
  for (let i = 0; i < P.MAX_DEVICES; i++) subs = P.upsertSubscription(subs, goodSub(String(i)), "d" + i, 1000 + i).subscriptions;
  assert.equal(Object.keys(subs).length, P.MAX_DEVICES);
  const r = P.upsertSubscription(subs, goodSub("new"), "newest", 9999);
  assert.equal(Object.keys(r.subscriptions).length, P.MAX_DEVICES);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0], P.subscriptionId(goodSub("0").endpoint), "oldest evicted");
  assert.ok(r.subscriptions[P.subscriptionId(goodSub("new").endpoint)], "the new device is kept");
});

test("device labels are cleaned", () => {
  const dirty = P.cleanDeviceLabel("  iPhone <script>alert(1)</script> \"quoted\" ");
  assert.doesNotMatch(dirty, /[<>"'\/]/, "no markup characters survive: " + dirty);
  assert.match(dirty, /^iPhone /);
  assert.equal(P.cleanDeviceLabel("iPhone (Safari)"), "iPhone (Safari)");
  assert.equal(P.cleanDeviceLabel(""), "Device");
  assert.equal(P.cleanDeviceLabel(undefined), "Device");
  assert.equal(P.cleanDeviceLabel("x".repeat(200)).length, 60);
});

// ── privacy: no buy-ins on the lock screen ──
test("hideAmounts leaves the buy-in out of both kinds of alert, and only when switched on", () => {
  assert.equal(P.pushPrefs({pushHideAmounts: true}).hideAmounts, true);
  assert.equal(P.pushPrefs({pushHideAmounts: "yes"}).hideAmounts, false, "only a real true switches it on");
  const normal = P.buildStartingSoonPayload(ev(), 45);
  assert.match(normal.body, /₱3,300/);
  const hidden = P.buildStartingSoonPayload(ev({gtd: "₱1M"}), 45, {hideAmounts: true});
  assert.doesNotMatch(hidden.body, /₱3,300/, "buy-in is gone");
  assert.match(hidden.body, /7:00 PM · Metro Card Club/, "time and venue stay");
  const digest = P.buildDigestPayload([ev(), ev({id: 2, name: "Second", buyin: 5000})], "2026-10-04", {hideAmounts: true});
  assert.doesNotMatch(digest.body, /₱/, "no amounts in the morning summary");
  assert.match(digest.body, /Metro Sunday Main \(7:00 PM\)/);
  assert.match(P.buildDigestPayload([ev()], "2026-10-04").body, /₱3,300/, "unchanged when off");
  assert.equal(P.buildStartingSoonPayload(ev(), 45, undefined).body, normal.body);
});
