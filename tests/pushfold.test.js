"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const pf = require("../js/data/pushfold.js");

test("hand order is a complete, duplicate-free set of 169 classes", () => {
  assert.equal(pf.HAND_ORDER.length, 169);
  assert.equal(new Set(pf.HAND_ORDER).size, 169);
  const total = pf.HAND_ORDER.reduce((n, h) => n + pf.combosOf(h), 0);
  assert.equal(total, 1326);
  assert.equal(pf.HAND_ORDER[0], "AA");
  assert.equal(pf.HAND_ORDER[168], "72o");
});

test("combo counts", () => {
  assert.equal(pf.combosOf("AA"), 6);
  assert.equal(pf.combosOf("AKs"), 4);
  assert.equal(pf.combosOf("AKo"), 12);
});

test("shove % never gets wider as the stack gets deeper", () => {
  for (const p of pf.POSITIONS) {
    let prev = Infinity;
    for (let s = 3; s <= 25; s += 0.5) {
      const pct = pf.shovePct({ stackBB: s, behind: p.behind });
      assert.ok(pct <= prev + 1e-9, `${p.label} @${s}bb widened: ${pct} > ${prev}`);
      prev = pct;
    }
  }
});

test("shove % never gets tighter from a later position", () => {
  for (let s = 3; s <= 25; s += 1) {
    let prev = -1;
    for (const p of pf.POSITIONS.slice().sort((a, b) => b.behind - a.behind)) {
      const pct = pf.shovePct({ stackBB: s, behind: p.behind });
      assert.ok(pct >= prev - 1e-9, `${p.label} @${s}bb tighter than an earlier seat`);
      prev = pct;
    }
  }
});

test("the old advice is gone: no shoving any two from early position at 10bb", () => {
  const utg = pf.shovePct({ stackBB: 10, behind: 8 });
  assert.ok(utg < 20, `UTG @10bb should be tight, got ${utg}%`);
  const btn = pf.shovePct({ stackBB: 10, behind: 2 });
  assert.ok(btn > utg * 2, "BTN should be far wider than UTG");
  assert.ok(pf.shovePct({ stackBB: 10, behind: 1 }) < 100);
});

test("antes widen, bubble pressure tightens", () => {
  const base = pf.shovePct({ stackBB: 12, behind: 4 });
  assert.ok(pf.shovePct({ stackBB: 12, behind: 4, ante: true }) > base);
  assert.ok(pf.shovePct({ stackBB: 12, behind: 4, bubble: true }) < base);
  assert.ok(pf.shovePct({ stackBB: 3, behind: 1, ante: true }) <= 100);
});

test("deeper than the chart range: push/fold does not apply", () => {
  assert.equal(pf.basePct(40, 2), 0);
  assert.equal(pf.advise({ stackBB: 40, position: "btn" }).applies, false);
  assert.equal(pf.advise({ stackBB: 10, position: "btn" }).applies, true);
});

test("rangeForPct returns the strongest hands first and reports its real width", () => {
  const r = pf.rangeForPct(10);
  assert.deepEqual(r.hands.slice(0, 4), ["AA", "KK", "QQ", "JJ"]);
  assert.ok(Math.abs(r.actualPct - 10) < 2.5, `actual ${r.actualPct}`);
  assert.equal(pf.rangeForPct(100).hands.length, 169);
  assert.equal(pf.rangeForPct(0).hands.length, 0);
  assert.ok(pf.rangeForPct(0.5).hands.length >= 1);
});

test("compressRange notation", () => {
  assert.equal(pf.compressRange(["AA", "KK", "QQ", "JJ"]), "JJ+");
  assert.equal(pf.compressRange(["AA"]), "AA");
  assert.equal(pf.compressRange(["TT", "99", "88"]), "TT-88");
  assert.equal(pf.compressRange(["55"]), "55");
  assert.equal(pf.compressRange(["AKs", "AQs", "AJs", "ATs"]), "ATs+");
  assert.equal(pf.compressRange(["AKs"]), "AKs");
  assert.equal(pf.compressRange(["AKo", "AQo"]), "AQo+");
  assert.equal(pf.compressRange(["A5s", "A4s", "A3s"]), "A5s-A3s");
  assert.equal(pf.compressRange(["AA", "KK", "AKs", "AKo", "KQs", "A5s"]), "KK+, AKs, A5s, KQs, AKo");
});

test("compressRange over a real range is compact and lossless", () => {
  const r = pf.rangeForPct(27);
  const text = pf.compressRange(r.hands);
  assert.ok(text.length > 0 && text.length < 160, text);
  // expand the notation back and compare
  const R = "23456789TJQKA";
  const back = new Set();
  text.split(", ").forEach((tok) => {
    let m;
    if ((m = tok.match(/^([2-9TJQKA])\1\+$/))) { for (let i = R.indexOf(m[1]); i < 13; i++) back.add(R[i] + R[i]); }
    else if ((m = tok.match(/^([2-9TJQKA])\1-([2-9TJQKA])\2$/))) { for (let i = R.indexOf(m[2]); i <= R.indexOf(m[1]); i++) back.add(R[i] + R[i]); }
    else if ((m = tok.match(/^([2-9TJQKA])\1$/))) back.add(tok);
    else if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/))) { for (let i = R.indexOf(m[2]); i < R.indexOf(m[1]); i++) back.add(m[1] + R[i] + m[3]); }
    else if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])-([2-9TJQKA])([2-9TJQKA])\3$/))) { for (let i = R.indexOf(m[5]); i <= R.indexOf(m[2]); i++) back.add(m[1] + R[i] + m[3]); }
    else if ((m = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])$/))) back.add(tok);
    else assert.fail("unparseable token " + tok);
  });
  assert.deepEqual([...back].sort(), r.hands.slice().sort());
});

test("M-ratio counts antes", () => {
  assert.equal(pf.mRatio(15, false), 10);
  assert.equal(pf.mRatio(25, true), 10);
});

test("advise returns every position and marks the selected one", () => {
  const a = pf.advise({ stackBB: 10, position: "co", ante: false, bubble: false });
  assert.equal(a.all.length, 8);
  assert.equal(a.selected.key, "co");
  assert.equal(a.selected.behind, 3);
  assert.ok(a.selected.text.length > 0);
});
