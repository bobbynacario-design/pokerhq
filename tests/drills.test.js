"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../js/data/drills.js");

const TODAY = "2026-09-29";   // a Tuesday

// ── library ──
test("the library is well formed: unique ids, real themes, both step texts, valid buttons", () => {
  const ids = new Set();
  for (const x of D.DRILLS) {
    assert.ok(!ids.has(x.id), "duplicate id " + x.id);
    ids.add(x.id);
    assert.ok(D.CATEGORIES[x.cat], x.id + " has a real category");
    assert.ok(x.title.length >= 8 && x.title.length <= 60, x.id + " title length " + x.title.length);
    for (const k of ["light", "deep"]) {
      assert.ok(x[k].length >= 30 && x[k].length <= 200, x.id + " " + k + " length " + x[k].length);
      assert.ok(/[.?!"]$/.test(x[k]), x.id + " " + k + " ends like a sentence");
    }
    assert.notEqual(x.light, x.deep);
    if (x.go) {
      assert.ok(D.ACTIONS.includes(x.go.action), x.id + " go action " + x.go.action);
      assert.match(x.go.label, /^[A-Z ]+$/);
    }
  }
  assert.ok(D.DRILLS.length >= 50);
});

test("every theme has at least six drills, and every mood has enough to work with", () => {
  for (const cat of Object.keys(D.CATEGORIES)) {
    assert.ok(D.DRILLS.filter((x) => x.cat === cat).length >= 6, cat);
  }
  for (const m of D.MOODS) {
    if (m.cats) for (const c of m.cats) assert.ok(D.CATEGORIES[c], m.key + " uses a real category");
  }
  const bankroll = D.MOODS.find((m) => m.key === "protect");
  assert.deepEqual(bankroll.cats, ["bankroll"]);
});

test("drills that say they open a calculator mode or page use an action the card handles", () => {
  const used = new Set(D.DRILLS.filter((x) => x.go).map((x) => x.go.action));
  for (const a of used) assert.ok(D.ACTIONS.includes(a), a);
  assert.ok(used.has("advisor") && used.has("icm") && used.has("hands") && used.has("opponents"), "the poker tools are wired in");
});

// ── choosing ──
test("pick is stable: the same day and state always give the same drill", () => {
  const ctx = { eventSoon: false };
  const a = D.pick({ today: TODAY, ctx, state: {} });
  const b = D.pick({ today: TODAY, ctx, state: {} });
  assert.equal(a.drill.id, b.drill.id);
  assert.ok(a.total > 40 && a.index === 0);
  assert.ok(D.byId(D.pick({ today: "2026-09-30", ctx, state: {} }).drill.id), "a real drill on any other day");
});

test("the pick changes from day to day (not the same drill every morning)", () => {
  const seen = new Set();
  let day = "2026-10-01";
  for (let i = 0; i < 20; i++) { seen.add(D.pick({ today: day, ctx: {}, state: {} }).drill.id); day = D.addDays(day, 1); }
  assert.ok(seen.size >= 10, "only " + seen.size + " distinct drills in 20 days");
});

test("try another walks the ranked list without repeating, then wraps", () => {
  let state = D.normalizeState({});
  const seen = [];
  const total = D.pick({ today: TODAY, ctx: {}, state }).total;
  for (let i = 0; i < total; i++) {
    seen.push(D.pick({ today: TODAY, ctx: {}, state }).drill.id);
    state = D.skip(state, TODAY);
  }
  assert.equal(new Set(seen).size, total, "no repeats before the list is used up");
  assert.equal(D.pick({ today: TODAY, ctx: {}, state }).drill.id, seen[0], "then it wraps");
});

test("a match today boosts pre-game drills; with nothing on they are rare", () => {
  const count = (ctx) => {
    let n = 0, day = "2026-10-01";
    for (let i = 0; i < 60; i++) { if (D.pick({ today: day, ctx, state: {} }).drill.cat === "prep") n++; day = D.addDays(day, 1); }
    return n;
  };
  const withEvent = count({ eventSoon: true }), without = count({});
  assert.ok(withEvent >= 15, "pre-game drills when playing soon: " + withEvent + "/60");
  assert.ok(without <= 6, "pre-game drills with nothing on: " + without + "/60");
});

test("a rough session leans toward mental-game and review drills; low shots toward bankroll", () => {
  const share = (ctx, cats) => {
    let n = 0, day = "2026-10-01";
    for (let i = 0; i < 80; i++) { if (cats.includes(D.pick({ today: day, ctx, state: {} }).drill.cat)) n++; day = D.addDays(day, 1); }
    return n;
  };
  assert.ok(share({ recentLoss: true }, ["mental", "review"]) > share({}, ["mental", "review"]) + 6);
  assert.ok(share({ lowShots: true }, ["bankroll"]) > share({}, ["bankroll"]) + 8);
});

test("a mood only offers its own themes", () => {
  for (const m of D.MOODS.filter((x) => x.cats)) {
    const list = D.ranked({ today: TODAY, ctx: {}, state: {}, mood: m.key });
    assert.ok(list.length >= 3, m.key);
    for (const x of list) assert.ok(m.cats.includes(x.cat), m.key + " offered " + x.cat);
  }
  const all = D.ranked({ today: TODAY, ctx: {}, state: {}, mood: "surprise" });
  assert.equal(new Set(all.map((x) => x.cat)).size, Object.keys(D.CATEGORIES).length);
});

test("finished drills sit out for 10 days but today's own pick stays put", () => {
  const first = D.pick({ today: TODAY, ctx: {}, state: {} }).drill;
  const done = D.markDone({}, TODAY, first.id, "light");
  assert.equal(D.pick({ today: TODAY, ctx: {}, state: done }).drill.id, first.id, "still shows today's finished drill");
  const tomorrow = D.ranked({ today: D.addDays(TODAY, 1), ctx: {}, state: done }).map((x) => x.id);
  assert.ok(!tomorrow.includes(first.id), "not offered the next day");
  const later = D.ranked({ today: D.addDays(TODAY, D.REPEAT_GAP_DAYS + 1), ctx: {}, state: done }).map((x) => x.id);
  assert.ok(later.includes(first.id), "comes back after the gap");
});

test("'not today' hides a drill for two weeks", () => {
  const x = D.pick({ today: TODAY, ctx: {}, state: {} }).drill;
  const s = D.feedback({}, TODAY, x.id, "notToday");
  assert.ok(!D.ranked({ today: TODAY, ctx: {}, state: s }).some((y) => y.id === x.id), "gone today");
  assert.ok(!D.ranked({ today: D.addDays(TODAY, D.HIDE_DAYS), ctx: {}, state: s }).some((y) => y.id === x.id), "still gone on the last day");
  assert.ok(D.ranked({ today: D.addDays(TODAY, D.HIDE_DAYS + 1), ctx: {}, state: s }).some((y) => y.id === x.id), "back after");
  assert.equal(D.prune(s, D.addDays(TODAY, D.HIDE_DAYS + 1)).hidden[x.id], undefined, "and forgotten");
});

test("feedback nudges the theme: 'more like this' outweighs 'helpful', both are capped", () => {
  const x = D.byId("post-odds");
  let s = D.feedback({}, TODAY, x.id, "helpful");
  assert.equal(s.bias.postflop, 1);
  s = D.feedback(s, TODAY, x.id, "more");
  assert.equal(s.bias.postflop, 3);
  for (let i = 0; i < 10; i++) s = D.feedback(s, TODAY, x.id, "more");
  assert.equal(s.bias.postflop, 5, "capped");
  let low = {};
  for (let i = 0; i < 20; i++) low = D.feedback(low, TODAY, "post-odds", "notToday");
  assert.equal(low.bias.postflop, -3, "floor");
  // and a boosted theme shows up more
  const count = (state) => { let n = 0, day = "2026-11-01"; for (let i = 0; i < 80; i++) { if (D.pick({ today: day, ctx: {}, state }).drill.cat === "postflop") n++; day = D.addDays(day, 1); } return n; };
  assert.ok(count(s) > count({}) + 5);
});

test("the reason line explains the pick", () => {
  const prep = D.byId("prep-rules"), bank = D.byId("bank-shots"), men = D.byId("men-tilt"), rev = D.byId("rev-hand");
  assert.match(D.reasonFor(prep, { eventSoon: true }, "surprise"), /playing soon/);
  assert.match(D.reasonFor(bank, { lowShots: true }, "surprise"), /short on shots/);
  assert.match(D.reasonFor(men, { recentLoss: true }, "surprise"), /rough one/);
  assert.match(D.reasonFor(rev, { noHands: true }, "surprise"), /haven't logged a hand/);
  assert.match(D.reasonFor(men, {}, "sharpen"), /You asked for: sharpen my game/);
  assert.equal(D.reasonFor(men, {}, "surprise"), "From today's rotation");
});

// ── the week ──
test("weekDays is Monday to Sunday, marks today, done days, and the future", () => {
  const s = D.markDone(D.markDone({}, "2026-09-28", "rev-hand", "light"), TODAY, "pre-open", "deep");
  const w = D.weekDays(s, TODAY);   // Tue 29 Sep 2026
  assert.deepEqual(w.map((x) => x.label), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
  assert.deepEqual(w.map((x) => x.date), ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.deepEqual(w.map((x) => x.done), [true, true, false, false, false, false, false]);
  assert.deepEqual(w.map((x) => x.isToday), [false, true, false, false, false, false, false]);
  assert.deepEqual(w.map((x) => x.future), [false, false, true, true, true, true, true]);
  // a Sunday belongs to the week that started six days earlier
  assert.equal(D.weekDays({}, "2026-10-04")[0].date, "2026-09-28");
  assert.equal(D.weekDays({}, "2026-10-05")[0].date, "2026-10-05");
  assert.deepEqual(D.weekDays({}, "not a date"), []);
});

test("streak counts days in a row, and survives an unfinished today", () => {
  let s = {};
  assert.equal(D.streak(s, TODAY), 0);
  s = D.markDone(s, "2026-09-27", "rev-hand", "light");
  s = D.markDone(s, "2026-09-28", "pre-open", "light");
  assert.equal(D.streak(s, TODAY), 2, "yesterday and the day before, today not done yet");
  s = D.markDone(s, TODAY, "men-tilt", "light");
  assert.equal(D.streak(s, TODAY), 3);
  assert.equal(D.streak(D.markDone({}, "2026-09-25", "rev-hand", "light"), TODAY), 0, "a gap breaks it");
  // month boundary
  const m = D.markDone(D.markDone({}, "2026-09-30", "rev-hand", "light"), "2026-10-01", "pre-open", "light");
  assert.equal(D.streak(m, "2026-10-01"), 2);
});

test("the week message reads naturally", () => {
  assert.equal(D.weekMessage({}, TODAY), "A fresh week. Any day can be the first.");
  assert.equal(D.weekMessage(D.markDone({}, TODAY, "rev-hand", "light"), TODAY), "1 drill this week. Nice.");
  let s = D.markDone(D.markDone({}, "2026-09-27", "rev-hand", "light"), "2026-09-28", "pre-open", "light");
  assert.match(D.weekMessage(s, TODAY), /2-day run so far/);
  s = D.markDone(s, TODAY, "men-tilt", "light");
  assert.match(D.weekMessage(s, TODAY), /3 days running/);
});

// ── saved state ──
test("normalizeState repairs garbage instead of throwing", () => {
  for (const junk of [null, undefined, 5, "x", [], { log: "no", skips: 3, bias: [], hidden: null, saved: "nope" }]) {
    const s = D.normalizeState(junk);
    assert.deepEqual(Object.keys(s).sort(), ["bias", "hidden", "level", "log", "mood", "saved", "skips", "tucked"]);
    assert.equal(s.mood, "surprise");
    assert.equal(s.level, "light");
  }
  const s = D.normalizeState({
    log: { "2026-09-29": { id: "rev-hand", level: "deep" }, "bad-date": { id: "rev-hand" }, "2026-09-28": { id: "no-such-drill" } },
    skips: { "2026-09-29": 3.9, "2026-09-28": -2 },
    bias: { postflop: 99, nonsense: 1, preflop: "x" },
    hidden: { "rev-hand": "2026-10-10", "no-such": "2026-10-10", "pre-open": "junk" },
    saved: ["rev-hand", "rev-hand", "no-such"],
    tucked: "2026-09-29", mood: "steady", level: "deep",
  });
  assert.deepEqual(s.log, { "2026-09-29": { id: "rev-hand", level: "deep" } });
  assert.deepEqual(s.skips, { "2026-09-29": 3 });
  assert.deepEqual(s.bias, { postflop: 5 });
  assert.deepEqual(s.hidden, { "rev-hand": "2026-10-10" });
  assert.deepEqual(s.saved, ["rev-hand"]);
  assert.equal(s.tucked, "2026-09-29");
  assert.equal(s.mood, "steady");
  assert.equal(s.level, "deep");
});

test("markDone / undoDone / toggleSaved never mutate their input", () => {
  const base = D.normalizeState({});
  const frozen = JSON.stringify(base);
  const done = D.markDone(base, TODAY, "rev-hand", "deep");
  assert.equal(JSON.stringify(base), frozen);
  assert.deepEqual(done.log[TODAY], { id: "rev-hand", level: "deep" });
  assert.equal(D.undoDone(done, TODAY).log[TODAY], undefined);
  const saved = D.toggleSaved(base, "rev-hand");
  assert.deepEqual(saved.saved, ["rev-hand"]);
  assert.deepEqual(D.toggleSaved(saved, "rev-hand").saved, []);
  assert.deepEqual(D.toggleSaved(base, "no-such").saved, []);
  assert.equal(D.markDone(base, TODAY, "no-such", "light").log[TODAY], undefined);
});

test("prune keeps the last 120 days and forgets older history", () => {
  let s = D.markDone({}, "2026-01-01", "rev-hand", "light");
  s = D.markDone(s, "2026-06-01", "pre-open", "light");
  const pruned = D.markDone(s, TODAY, "men-tilt", "light");   // markDone prunes
  assert.equal(pruned.log["2026-01-01"], undefined);
  assert.ok(pruned.log["2026-06-01"]);
  assert.ok(pruned.log[TODAY]);
});

test("dates: labels and arithmetic use the calendar day, across month and year ends", () => {
  assert.equal(D.dayLabel("2026-09-29"), "Tue 29 Sep");
  assert.equal(D.dayLabel("2026-01-01"), "Thu 1 Jan");
  assert.equal(D.dayLabel("garbage"), "");
  assert.equal(D.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(D.addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(D.daysBetween("2026-09-29", "2026-10-02"), 3);
});
