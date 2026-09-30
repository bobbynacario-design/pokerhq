"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const I = require("../js/data/inbox.js");

const NOON = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).getTime();
const NOW = NOON(2026, 9, 30);
const DAY = 86400000;
const ago = (days) => NOW - days * DAY;
const isoDaysAgo = (days) => { const d = new Date(ago(days)); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const keys = (r) => r.items.map((i) => i.key);
const build = (over) => I.build(Object.assign({ now: NOW, sessions: [], hands: [], opponents: [], savedDrills: [], recentVenues: [] }, over || {}));

test("an empty app has an empty inbox", () => {
  const r = build();
  assert.deepEqual(r, { items: [], total: 0, byKind: { session: 0, hand: 0, leak: 0, lesson: 0, opponent: 0, drill: 0 } });
  assert.equal(I.build().total, 0, "no input at all is fine");
  assert.equal(I.build({ hands: "nope", sessions: null }).total, 0, "junk lists are ignored");
});

test("sessions: every unfinished debrief stays visible; older ones become overdue", () => {
  const sessions = [
    { id: 1, name: "Yesterday's main", date: isoDaysAgo(1) },
    { id: 2, name: "Two weeks ago", date: isoDaysAgo(14) },
    { id: 3, name: "Fifteen days ago", date: isoDaysAgo(15) },
    { id: 4, name: "Debriefed", date: isoDaysAgo(2), debriefedAt: NOW - DAY },
    { id: 5, name: "Tomorrow?", date: isoDaysAgo(-1) },
    { id: 6, name: "No date" },
    { id: 7, name: "Bad date", date: "sometime" },
    null,
  ];
  const r = build({ sessions });
  assert.deepEqual(keys(r), ["session:3", "session:2", "session:1"], "oldest first within the kind");
  const y = r.items.find((i) => i.ref === 1);
  assert.equal(y.title, "Yesterday's main");
  assert.equal(y.detail, "No debrief yet · played yesterday");
  assert.equal(y.kind, "session");
  assert.equal(y.ageDays, 1);
  assert.equal(r.items.find((i) => i.ref === 2).detail, "No debrief yet · played 14 days ago");
  assert.equal(r.items.find((i) => i.ref === 3).detail, "Overdue debrief · played 15 days ago");
  assert.equal(build({ sessions: [{ id: 1, name: "Today", date: isoDaysAgo(0) }] }).items[0].detail, "No debrief yet · played today");
});

test("hands: needs details and/or marked review later, until resolved", () => {
  const hands = [
    { id: 1, title: "Marker", needsDetails: true, tags: ["bigpot"], marker: { kind: "bigpot", at: ago(3) } },
    { id: 2, title: "Later hand", tags: ["later", "tilt"], id: 2 },
    { id: 3, title: "Both", needsDetails: true, tags: ["later"], marker: { kind: "later", at: ago(0) } },
    { id: 4, title: "Resolved", needsDetails: true, tags: ["later"], resolvedAt: NOW - 1000 },
    { id: 5, title: "Plain finished hand", tags: ["tilt"] },
    { id: 6, title: "Not needing anything", needsDetails: false },
  ];
  const r = build({ hands });
  assert.deepEqual(keys(r).sort(), ["hand:1", "hand:2", "hand:3"]);
  const one = r.items.find((i) => i.ref === 1);
  assert.equal(one.detail, "Needs details · 3 days ago");
  assert.equal(one.action, "finish");
  const two = r.items.find((i) => i.ref === 2);
  assert.equal(two.detail, "Marked review later", "no time known, so no age");
  assert.equal(two.action, "replay");
  const three = r.items.find((i) => i.ref === 3);
  assert.equal(three.detail, "Needs details · Marked review later · today", "one item for a hand with both reasons");
  assert.equal(three.action, "finish", "finish the details first");
});

test("a hand's age comes from its marker, its id, or its session; small demo ids are not times", () => {
  const sessions = [{ id: 50, date: isoDaysAgo(6), name: "S" }];
  assert.equal(I.handTime({ marker: { at: 123 }, id: 5 }, sessions), 123);
  assert.equal(I.handTime({ id: ago(2) }, sessions), ago(2));
  assert.equal(I.handTime({ id: 7001, sessionId: 50 }, sessions), NOON(...isoDaysAgo(6).split("-").map(Number)));
  assert.equal(I.handTime({ id: 7001 }, sessions), null);
  assert.equal(I.handTime({ id: 7001, sessionId: 999 }, sessions), null);
});

test("lessons come back for a re-read after 3, then 10, then 30 days, and are done after three 'got it's", () => {
  const h = (extra) => Object.assign({ id: ago(1), title: "KK vs shove", lesson: "Fold KK to a 4-bet from a nit", tags: [] }, extra || {});
  // first read due 3 days after the hand
  assert.equal(build({ hands: [h({ id: ago(2) })] }).total, 0, "2 days: too soon");
  const due = build({ hands: [h({ id: ago(3) })] });
  assert.equal(due.total, 1);
  assert.equal(due.items[0].kind, "lesson");
  assert.equal(due.items[0].title, "Fold KK to a 4-bet from a nit");
  assert.equal(due.items[0].detail, "From \"KK vs shove\" · re-read 1 of 3");
  // after "got it" the next wait is 10 days from then
  const rec = h({ id: ago(20) });
  I.resolve("lesson", rec, ago(9));
  assert.equal(rec.lessonStep, 1);
  assert.equal(build({ hands: [rec] }).total, 0, "9 days since got-it: not yet");
  rec.lessonSeenAt = ago(10);
  assert.equal(build({ hands: [rec] }).items[0].detail, "From \"KK vs shove\" · re-read 2 of 3");
  I.resolve("lesson", rec, ago(30));
  assert.equal(rec.lessonStep, 2);
  assert.equal(build({ hands: [rec] }).total, 1, "30 days after the second got-it it is due again");
  I.resolve("lesson", rec, ago(0));
  assert.equal(rec.lessonStep, 3);
  assert.equal(build({ hands: [Object.assign({}, rec, { lessonSeenAt: ago(400) })] }).total, 0, "three re-reads and it is done for good");
  // hands that cannot have a due lesson
  assert.equal(build({ hands: [h({ id: ago(9), lesson: "   " })] }).total, 0, "no lesson text");
  assert.equal(build({ hands: [h({ id: ago(9), needsDetails: true })] }).items.every((i) => i.kind !== "lesson"), true, "an unfinished marker has no lesson yet");
  assert.equal(build({ hands: [h({ id: 7001 })] }).total, 0, "no way to tell how old it is");
});

test("stale villain notes: only where you still play, and only if nobody has touched them for 60 days", () => {
  const old = NOON(2026, 1, 5);
  const opponents = [
    { id: old, name: "The Limper", venue: "Okada Manila", notes: "Open limps a lot" },
    { id: old, name: "Fresh note", venue: "Okada Manila", notes: "Just seen", updatedAt: ago(10) },
    { id: old, name: "Reviewed lately", venue: "Okada Manila", notes: "x", reviewedAt: ago(5) },
    { id: old, name: "Other room", venue: "Solaire", notes: "x" },
    { id: old, name: "No notes", venue: "Okada Manila", notes: "  " },
    { id: old, name: "No venue", notes: "x" },
    { id: ago(59), name: "Just under 60", venue: "Okada Manila", notes: "x" },
    { id: ago(60), name: "Exactly 60", venue: "Okada Manila, Parañaque", notes: "x" },
  ];
  const r = build({ opponents, recentVenues: ["Okada Manila, Parañaque"] });
  assert.deepEqual(r.items.map((i) => i.title).sort(), ["Exactly 60", "The Limper"]);
  assert.match(r.items.find((i) => i.title === "The Limper").detail, /^Notes last touched \d+ days ago · Okada Manila$/);
  assert.equal(build({ opponents, recentVenues: [] }).total, 0, "no recent venues, nothing to refresh");
  // the added date counts as the last touch when there is no timestamp
  const demo = [{ id: 5001, name: "Demo villain", venue: "Metro Card Club", notes: "x", added: "2026-03-15" }];
  assert.equal(build({ opponents: demo, recentVenues: ["Metro Card Club"] }).total, 1);
  assert.equal(build({ opponents: [{ id: 5002, name: "Nothing to age", venue: "Metro Card Club", notes: "x" }], recentVenues: ["Metro Card Club"] }).total, 0);
});

test("venue names match loosely but never on scraps", () => {
  assert.equal(I.venueMatches("Okada Manila", "okada manila, Parañaque"), true);
  assert.equal(I.venueMatches("Metro Card Club", "METRO CARD CLUB"), true);
  assert.equal(I.venueMatches("Solaire", "Solaire Resort & Casino"), true);
  assert.equal(I.venueMatches("Okada", "Solaire"), false);
  assert.equal(I.venueMatches("", "Okada"), false);
  assert.equal(I.venueMatches("ok", "okada"), false, "too short to trust");
  assert.equal(I.normalizeVenue("  Okada,  Manila! "), "okada manila");
});

test("saved drills are listed as they are", () => {
  const r = build({ savedDrills: [{ id: "pre-open", title: "Recite your opening ranges", detail: "Preflop · 2 min" }, { id: "x" }, null, {}] });
  assert.deepEqual(r.items.map((i) => [i.key, i.title, i.detail]), [["drill:pre-open", "Recite your opening ranges", "Preflop · 2 min"], ["drill:x", "Drill", "You saved this to do later"]]);
});

test("the list is ordered by kind (debrief, hands, lessons, villains, drills), then oldest first", () => {
  const r = build({
    sessions: [{ id: 1, name: "S1", date: isoDaysAgo(1) }, { id: 2, name: "S2", date: isoDaysAgo(6) }],
    hands: [{ id: ago(5), title: "old marker", needsDetails: true }, { id: ago(1), title: "new marker", needsDetails: true }, { id: ago(8), title: "H", lesson: "L", tags: [] }],
    opponents: [{ id: ago(100), name: "V", venue: "Okada", notes: "n" }],
    savedDrills: [{ id: "d", title: "D" }],
    recentVenues: ["Okada"],
  });
  assert.deepEqual(r.items.map((i) => i.kind), ["session", "session", "hand", "hand", "lesson", "opponent", "drill"]);
  assert.deepEqual(r.items.filter((i) => i.kind === "session").map((i) => i.ref), [2, 1], "the older debrief first");
  assert.deepEqual(r.items.filter((i) => i.kind === "hand").map((i) => i.title), ["old marker", "new marker"]);
  assert.deepEqual(r.byKind, { session: 2, hand: 2, leak: 0, lesson: 1, opponent: 1, drill: 1 });
  assert.equal(r.total, 7);
  assert.deepEqual(I.KIND_ORDER, ["session", "hand", "leak", "lesson", "opponent", "drill"]);
  I.KIND_ORDER.forEach((k) => assert.ok(I.KINDS[k].label && I.KINDS[k].icon));
});

test("resolving writes a flag on the record, removes the item, and can be undone exactly", () => {
  const hand = { id: ago(2), title: "H", needsDetails: true, tags: ["later"] };
  const session = { id: 1, name: "S", date: isoDaysAgo(1) };
  const opp = { id: ago(100), name: "V", venue: "Okada", notes: "n" };
  const input = () => ({ sessions: [session], hands: [hand], opponents: [opp], recentVenues: ["Okada"] });
  assert.equal(build(input()).total, 3);
  const prevHand = I.resolve("hand", hand, NOW);
  const prevSession = I.resolve("session", session, NOW);
  const prevOpp = I.resolve("opponent", opp, NOW);
  assert.equal(hand.resolvedAt, NOW);
  assert.equal(session.debriefedAt, NOW);
  assert.equal(opp.reviewedAt, NOW);
  assert.equal(build(input()).total, 0, "all three are out of the inbox");
  I.undo(hand, prevHand); I.undo(session, prevSession); I.undo(opp, prevOpp);
  assert.equal("resolvedAt" in hand, false, "the flag is removed, not left as undefined");
  assert.equal("debriefedAt" in session, false);
  assert.equal("reviewedAt" in opp, false);
  assert.equal(build(input()).total, 3, "undo brings them back");
  assert.equal(I.resolve("drill", {}, NOW), null, "drills are resolved by the drill list, not a record");
  assert.equal(I.resolve("hand", null, NOW), null);
  assert.equal(I.resolveFields("nope", {}, NOW), null);
});

test("an unresolved hand is not duplicated as a lesson; resolving it reveals the lesson schedule", () => {
  const hand = { id: ago(10), title: "H", lesson: "Fold it", tags: ["later"] };
  assert.deepEqual(keys(build({ hands: [hand] })), ["hand:" + hand.id]);
  I.resolve("hand", hand, NOW);
  assert.deepEqual(keys(build({ hands: [hand] })), ["lesson:" + hand.id], "resolving the hand does not silence its lesson");
});

test("three matching hand tags create one recurring leak that can be dismissed", () => {
  const hands = [1, 2, 3].map((n) => ({ id: ago(n), title: "H" + n, tags: ["tilt"] }));
  const r = build({ hands });
  assert.equal(r.byKind.leak, 1);
  assert.equal(r.items.find((i) => i.kind === "leak").ref, "tag:tilt");
  assert.equal(build({ hands, dismissedLeaks: { "tag:tilt": NOW } }).byKind.leak, 0);
  const olderDismissal = ago(4);
  assert.equal(build({ hands, dismissedLeaks: { "tag:tilt": olderDismissal } }).byKind.leak, 1, "three new examples make a dismissed leak return");
});

test("the wording of ages", () => {
  assert.equal(I.ageText(0), "today");
  assert.equal(I.ageText(-3), "today");
  assert.equal(I.ageText(1), "yesterday");
  assert.equal(I.ageText(9), "9 days ago");
  assert.equal(I.ageText(null), "");
  assert.equal(I.ageText(undefined), "");
});

test("the flags are plain data, so backups and sync carry them: a backup with them restores unchanged", () => {
  const B = require("../js/data/backup-format.js");
  const session = { id: 1, name: "S", date: "2026-09-29", total: 100, prize: 0, pnl: -100, result: "bust", debriefedAt: 1790000000000 };
  const hand = { id: 2, title: "H", resolvedAt: 5, lessonStep: 2, lessonSeenAt: 9 };
  const opp = { id: 3, name: "V", reviewedAt: 7, updatedAt: 8 };
  const file = { app: "PokerHQ", format: "backup", version: 1, data: { sessions: [session], hands: [hand], tourneys: [], strategies: [], news: [], spotlights: [], satellites: [], opponents: [opp], bankroll: { amount: 0, rule: 5 }, satTarget: { name: "", buyin: 0 } } };
  const r = B.parse(JSON.parse(JSON.stringify(file)));
  assert.equal(r.ok, true);
  assert.equal(r.data.sessions[0].debriefedAt, 1790000000000);
  assert.deepEqual(r.data.hands[0], hand);
  assert.deepEqual(r.data.opponents[0], opp);
});

test("the pieces are wired up: scripts, offline cache, the page, the nav, the Home card, the session button and the data hooks", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const html = read("index.html");
  assert.match(html, /<script src="\.\/js\/data\/inbox\.js\?v=\w+"><\/script>/);
  assert.match(html, /<script src="\.\/js\/features\/review-inbox\.js\?v=\w+"><\/script>/);
  assert.ok(html.indexOf("js/data/inbox.js") < html.indexOf("js/features/review-inbox.js"));
  const sw = read("sw.js");
  assert.match(sw, /\.\/js\/data\/inbox\.js/);
  assert.match(sw, /\.\/js\/features\/review-inbox\.js/);
  assert.match(html, /id="page-inbox"/);
  assert.match(html, /id="inbox-list"/);
  assert.match(html, /id="inbox-home-wrap"/);
  assert.equal((html.match(/data-page="inbox"/g) || []).length, 2, "desktop and phone sub-tabs");
  assert.ok((html.match(/class="inbox-badge"/g) || []).length >= 4, "badges on the REVIEW tab, the phone tab and both Inbox sub-tabs");
  assert.match(html, /if \(id==='inbox'\)/, "switchTab draws the page");
  assert.match(read("js/features/review.js"), /markSessionDebriefed\(/, "the session detail can mark a debrief done");
  assert.match(read("js/features/library.js"), /existing\.updatedAt = Date\.now\(\)/, "editing a villain counts as touching the notes");
  assert.match(read("js/features/active-session.js"), /refreshInbox\(\)/, "the inbox follows data changes");
  const drill = read("js/features/daily-drill.js");
  ["drillSavedList", "drillOpenSaved", "drillUnsave", "drillResave"].forEach((n) => assert.match(drill, new RegExp("window\\." + n + " = ")));
});

test("the 'review later' tag the inbox reads is the same id the marker buttons write", () => {
  const M = require("../js/data/markers.js");
  assert.ok(M.isKind(I.REVIEW_LATER_TAG), "markers.js has a kind called " + I.REVIEW_LATER_TAG);
  assert.equal(M.kindById(I.REVIEW_LATER_TAG).label, "Review later");
  const h = M.buildMarker({ kind: "later", now: NOW - DAY });
  const r = I.build({ now: NOW, hands: [h] });
  assert.equal(r.total, 1);
  assert.equal(r.items[0].detail, "Needs details · Marked review later · yesterday");
  M.finishHand(h, ["later"]);       // finishing the details leaves it waiting for review
  assert.equal(I.build({ now: NOW, hands: [h] }).items[0].detail, "Marked review later · yesterday");
});
