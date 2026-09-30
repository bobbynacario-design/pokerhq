"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("../js/data/markers.js");

test("there are the six one-tap markers, in the order on the buttons, with stable ids", () => {
  assert.deepEqual(M.KINDS.map((k) => k.id), ["bigpot", "icm", "read", "unsure", "tilt", "later"]);
  assert.deepEqual(M.KINDS.map((k) => k.label), ["Big pot", "ICM spot", "Opponent read", "Uncertain decision", "Tilt", "Review later"]);
  M.KINDS.forEach((k) => { assert.ok(k.icon && k.hint, k.id + " has an icon and a hint"); assert.equal(M.kindById(k.id), k); });
  assert.equal(new Set(M.KINDS.map((k) => k.id)).size, 6);
  assert.equal(M.kindById("nope"), null);
  assert.equal(M.kindById("constructor"), null, "inherited object keys are not kinds");
  assert.equal(M.isKind("tilt"), true);
  assert.equal(M.isKind("__proto__"), false);
});

test("elapsed time reads like a clock", () => {
  assert.equal(M.formatElapsed(0), "0:00");
  assert.equal(M.formatElapsed(125000), "2:05");
  assert.equal(M.formatElapsed(3599999), "59:59");
  assert.equal(M.formatElapsed(3600000), "1:00:00");
  assert.equal(M.formatElapsed(3725000), "1:02:05");
  assert.equal(M.formatElapsed(11 * 3600000 + 59000), "11:00:59");
  ["", null, undefined, -5, NaN, Infinity, "12"].forEach((bad) => assert.equal(M.formatElapsed(bad), "", String(bad)));
});

test("stack is stored as big blinds when it is a number, and kept short when it is anything else", () => {
  const cases = { "24": "24bb", "24bb": "24bb", "24 BB": "24bb", "24.46": "24.5bb", "0.5": "0.5bb", " 18 ": "18bb", "8.0bb": "8bb" };
  Object.keys(cases).forEach((input) => assert.equal(M.normalizeStack(input), cases[input], input));
  assert.equal(M.normalizeStack(""), "");
  assert.equal(M.normalizeStack(null), "");
  assert.equal(M.normalizeStack("0"), "", "a zero stack is not a stack");
  assert.equal(M.normalizeStack("short, 2 chips"), "short, 2 chips");
  assert.equal(M.normalizeStack("x".repeat(60)).length, 24, "long text is cut");
  assert.equal(M.normalizeLevel("  L12  800/1600  "), "L12  800/1600");
  assert.equal(M.normalizeLevel(undefined), "");
  assert.equal(M.normalizeLevel("y".repeat(60)).length, 24);
});

test("a tap becomes an unfinished hand with the time, stack and level, held against the running session", () => {
  const h = M.buildMarker({ kind: "bigpot", now: 1700000000000, elapsedMs: 2530000.4, stack: "24", level: "L12", sessionLabel: "Sunday Main — 2026-09-30", pendingSessionKey: "draft-1", existingIds: [] });
  assert.deepEqual(h, {
    id: 1700000000000, sessionId: 0, session: "Sunday Main — 2026-09-30", pendingSessionKey: "draft-1",
    title: "Big pot", desc: "", lesson: "", result: "", tags: ["bigpot"], needsDetails: true,
    marker: { kind: "bigpot", at: 1700000000000, elapsedMs: 2530000, stack: "24bb", level: "L12" },
  });
  assert.equal(M.buildMarker({ kind: "nope", now: 1 }), null);
  assert.equal(M.buildMarker({}), null);
});

test("empty stack, level and elapsed time are left off the record", () => {
  const h = M.buildMarker({ kind: "tilt", now: 5, elapsedMs: null, stack: "", level: "  ", sessionLabel: "", pendingSessionKey: "" });
  assert.deepEqual(h.marker, { kind: "tilt", at: 5 });
  assert.equal(M.buildMarker({ kind: "tilt", now: 5, elapsedMs: 0 }).marker.elapsedMs, 0, "0 is a real time (the very start)");
  assert.equal("elapsedMs" in M.buildMarker({ kind: "tilt", now: 5, elapsedMs: -3 }).marker, false, "a negative time is dropped");
  assert.equal("elapsedMs" in M.buildMarker({ kind: "tilt", now: 5, elapsedMs: NaN }).marker, false);
  assert.equal(h.session, "");
  assert.equal(h.pendingSessionKey, "");
});

test("two markers can never share an id, even in the same millisecond", () => {
  const a = M.buildMarker({ kind: "icm", now: 100, existingIds: [] });
  const b = M.buildMarker({ kind: "icm", now: 100, existingIds: [a.id] });
  const c = M.buildMarker({ kind: "icm", now: 100, existingIds: [a.id, b.id, 102] });
  assert.deepEqual([a.id, b.id, c.id], [100, 101, 103]);
});

test("the slip-of-the-thumb guard: the same button twice inside 1.5s counts once, other buttons never do", () => {
  assert.equal(M.shouldIgnoreTap("bigpot", 1000, "bigpot", 1500), true);
  assert.equal(M.shouldIgnoreTap("bigpot", 1000, "bigpot", 2499), true);
  assert.equal(M.shouldIgnoreTap("bigpot", 1000, "bigpot", 2500), false);
  assert.equal(M.shouldIgnoreTap("bigpot", 1000, "tilt", 1100), false, "a different marker is a different hand");
  assert.equal(M.shouldIgnoreTap("", 0, "bigpot", 10), false, "nothing tapped yet");
  assert.equal(M.shouldIgnoreTap("bigpot", 5000, "bigpot", 1000), false, "a clock that went backwards does not block taps");
});

test("describing a marker: time in, stack, level; the clock time when the timer was not running", () => {
  const withTimer = M.buildMarker({ kind: "unsure", now: 9, elapsedMs: 3725000, stack: "18", level: "L9" });
  assert.equal(M.describeMarker(withTimer), "Uncertain decision · 1:02:05 in · 18bb · L9");
  const noTimer = M.buildMarker({ kind: "read", now: 9 });
  assert.equal(M.describeMarker(noTimer), "Opponent read");
  assert.equal(M.describeMarker(noTimer, "10:42 PM"), "Opponent read · 10:42 PM");
  assert.equal(M.describeMarker({ title: "plain hand" }), "", "an ordinary hand has no marker");
  assert.equal(M.describeMarker(null), "");
});

test("tags: only known ones, in button order, no repeats; toggling adds and removes", () => {
  assert.deepEqual(M.handTags({ tags: ["tilt", "bogus", "bigpot", "tilt"] }), ["bigpot", "tilt"]);
  assert.deepEqual(M.handTags({}), []);
  assert.deepEqual(M.handTags(null), []);
  assert.deepEqual(M.handTags({ tags: "tilt" }), [], "a non-list is ignored");
  let t = [];
  t = M.toggleTag(t, "tilt");
  t = M.toggleTag(t, "bigpot");
  assert.deepEqual(t, ["bigpot", "tilt"]);
  t = M.toggleTag(t, "tilt");
  assert.deepEqual(t, ["bigpot"]);
  assert.deepEqual(M.toggleTag(t, "bogus"), ["bigpot"], "an unknown tag changes nothing");
});

const hand = (id, tags, needsDetails, sessionId) => ({ id, tags, needsDetails, sessionId: sessionId || 0 });
test("the tag summary counts each tag and the hands still waiting for details", () => {
  const hands = [hand(1, ["bigpot"], true), hand(2, ["bigpot", "tilt"], false), hand(3, [], undefined), hand(4, ["later"], true), { id: 5 }];
  const s = M.tagSummary(hands);
  assert.equal(s.total, 5);
  assert.equal(s.unfinished, 2);
  const by = Object.fromEntries(s.counts.map((c) => [c.id, c.count]));
  assert.deepEqual(by, { bigpot: 2, icm: 0, read: 0, unsure: 0, tilt: 1, later: 1 });
  assert.deepEqual(M.tagSummary(undefined), { total: 0, unfinished: 0, counts: M.KINDS.map((k) => ({ id: k.id, label: k.label, icon: k.icon, count: 0 })) });
});

test("filtering by tag, by 'unfinished', and by session, alone or together", () => {
  const hands = [hand(1, ["bigpot"], true, 10), hand(2, ["bigpot", "tilt"], false, 10), hand(3, [], false, 20), hand(4, ["tilt"], true, 20)];
  const ids = (l) => l.map((h) => h.id);
  assert.deepEqual(ids(M.filterHands(hands, {})), [1, 2, 3, 4]);
  assert.deepEqual(ids(M.filterHands(hands, { tag: "" })), [1, 2, 3, 4]);
  assert.deepEqual(ids(M.filterHands(hands, { tag: "bigpot" })), [1, 2]);
  assert.deepEqual(ids(M.filterHands(hands, { tag: "unfinished" })), [1, 4]);
  assert.deepEqual(ids(M.filterHands(hands, { tag: "tilt", sessionId: 20 })), [4]);
  assert.deepEqual(ids(M.filterHands(hands, { sessionId: 10 })), [1, 2]);
  assert.deepEqual(ids(M.filterHands(hands, { tag: "bogus" })), [1, 2, 3, 4], "an unknown filter shows everything rather than nothing");
  assert.deepEqual(M.filterHands(null, {}), []);
});

test("finishing a hand keeps the marker and clears the flag", () => {
  const h = M.buildMarker({ kind: "icm", now: 7, elapsedMs: 1000, stack: "12" });
  M.finishHand(h, ["icm", "unsure", "bogus"]);
  assert.equal(h.needsDetails, false);
  assert.deepEqual(h.tags, ["icm", "unsure"]);
  assert.equal(h.marker.stack, "12bb", "time and stack survive");
  assert.equal(M.isFinished(h), true);
  assert.equal(M.isFinished({ id: 1 }), true, "an ordinary hand is finished");
  assert.equal(M.isFinished({ needsDetails: true }), false);
});

test("a marker survives a backup: it is plain JSON and the backup reader keeps it", () => {
  const B = require("../js/data/backup-format.js");
  const h = M.buildMarker({ kind: "bigpot", now: 42, elapsedMs: 60000, stack: "20", level: "L3" });
  const file = { app: "PokerHQ", format: "backup", version: 1, data: { sessions: [], hands: [JSON.parse(JSON.stringify(h))], tourneys: [], strategies: [], news: [], spotlights: [], satellites: [], opponents: [], bankroll: { amount: 0, rule: 5 }, satTarget: { name: "", buyin: 0 } } };
  const r = B.parse(file);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.hands[0], h);
});

test("the pieces are wired up: script tags, offline cache, the six buttons, the hand form's tags and the study loop", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const html = read("index.html");
  assert.match(html, /<script src="\.\/js\/data\/markers\.js\?v=\w+"><\/script>/);
  assert.match(html, /<script src="\.\/js\/features\/live-markers\.js\?v=\w+"><\/script>/);
  assert.ok(html.indexOf("js/data/markers.js") < html.indexOf("js/features/live-markers.js"));
  const sw = read("sw.js");
  assert.match(sw, /\.\/js\/data\/markers\.js/);
  assert.match(sw, /\.\/js\/features\/live-markers\.js/);
  assert.match(html, /id="h-tags"/);
  assert.match(html, /id="hand-tag-bar"/);
  assert.match(read("js/features/active-session.js"), /liveMarkersHtml\(\)/, "the active-session card shows the buttons");
  assert.match(read("js/features/study-loop.js"), /needsDetails|isFinished/, "an unfinished marker is not counted as a reviewed hand");
});
