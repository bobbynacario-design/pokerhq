"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const I = require("../js/data/icm.js");

const sum = (a) => a.reduce((x, y) => x + y, 0);
const close = (a, b, eps = 1e-9, msg) => assert.ok(Math.abs(a - b) <= eps, (msg || "") + ` expected ${b}, got ${a}`);

// Independent reference: enumerate every finishing order and weight it directly.
function bruteForce(stacks, payouts) {
  const n = stacks.length;
  const total = sum(stacks);
  const eq = new Array(n).fill(0);
  function rec(remaining, order, prob) {
    if (order.length === Math.min(payouts.length, n) || remaining.length === 0) {
      order.forEach((p, place) => { eq[p] += prob * (payouts[place] || 0); });
      return;
    }
    const left = remaining.reduce((s, i) => s + stacks[i], 0);
    remaining.forEach((i) => {
      if (stacks[i] <= 0) return;
      rec(remaining.filter((x) => x !== i), order.concat(i), prob * (stacks[i] / left));
    });
  }
  rec([...Array(n).keys()], [], 1);
  return eq;
}

test("matches an independent brute-force enumeration on many random fields", () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let trial = 0; trial < 60; trial++) {
    const n = 2 + Math.floor(rnd() * 5);                       // 2..6 players
    const stacks = Array.from({length: n}, () => Math.round(rnd() * 90000) + 1000);
    const paid = 1 + Math.floor(rnd() * n);
    const payouts = Array.from({length: paid}, (_, i) => Math.round((paid - i) * 1000 * (0.5 + rnd())));
    payouts.sort((a, b) => b - a);
    const got = I.icm(stacks, payouts), want = bruteForce(stacks, payouts);
    got.forEach((g, i) => close(g, want[i], 1e-6, `trial ${trial} player ${i}`));
  }
});

test("the prize pool is always fully distributed (when every place is paid to someone)", () => {
  const stacks = [50000, 30000, 12000, 8000];
  const payouts = [5000, 3000, 2000, 1000];
  close(sum(I.icm(stacks, payouts)), sum(payouts), 1e-6);
});

test("winner-take-all ICM is just chip share", () => {
  const stacks = [60, 30, 10];
  const eq = I.icm(stacks, [100]);
  close(eq[0], 60, 1e-9); close(eq[1], 30, 1e-9); close(eq[2], 10, 1e-9);
});

test("equal stacks are worth the same; equity rises with stack", () => {
  const even = I.icm([1000, 1000, 1000], [50, 30, 20]);
  close(even[0], even[1]); close(even[1], even[2]); close(even[0], 100 / 3, 1e-9);
  const eq = I.icm([1000, 2000, 3000, 4000], [50, 30, 20]);
  for (let i = 1; i < eq.length; i++) assert.ok(eq[i] > eq[i - 1]);
});

test("ICM compresses: with a top-heavy ladder the chip leader is worth less than their chip share", () => {
  const stacks = [7000, 2000, 1000];
  const payouts = [50, 30, 20];
  const eq = I.icm(stacks, payouts);
  assert.ok(eq[0] / 100 < 0.7, "leader has 70% of chips but " + (eq[0]).toFixed(2) + "% of the money");
  assert.ok(eq[2] / 100 > 0.1, "short stack is worth more than its chip share");
});

test("a known small case computed by hand", () => {
  // 3 players 50/30/20 chips, 50/30/20 prizes. P1: 0.5*50 + 0.3*(0.3/0.5... )
  // 1st: P1 .5 P2 .3 P3 .2. 2nd given P1 won: P2 .6 P3 .4; given P2 won: P1 5/7 P3 2/7; given P3 won: P1 5/8 P2 3/8.
  const p1 = 0.5 * 50 + (0.3 * (5 / 7) + 0.2 * (5 / 8)) * 30 + (1 - 0.5 - (0.3 * (5 / 7) + 0.2 * (5 / 8))) * 20;
  const eq = I.icm([50, 30, 20], [50, 30, 20]);
  close(eq[0], p1, 1e-9);
});

test("players with no chips earn nothing and don't break anything", () => {
  const eq = I.icm([5000, 0, 5000], [60, 40]);
  assert.equal(eq[1], 0);
  close(eq[0], 50); close(eq[2], 50);
  assert.deepEqual(I.icm([0, 0], [10]), [0, 0]);
});

test("handles the maximum field quickly", () => {
  const stacks = Array.from({length: I.MAX_PLAYERS}, (_, i) => 1000 + i * 500);
  const payouts = [400, 250, 150, 100, 60, 40];
  const t0 = Date.now();
  const eq = I.icm(stacks, payouts);
  assert.ok(Date.now() - t0 < 1500, "took " + (Date.now() - t0) + "ms");
  close(sum(eq), sum(payouts), 1e-6);
  assert.throws(() => I.icm(Array(I.MAX_PLAYERS + 1).fill(1), [1]));
});

// ── call analysis ──
test("heads-up, equal stacks, no dead money: ICM adds no tax (break-even is 50%)", () => {
  const a = I.callAnalysis({stacks: [1000, 1000], payouts: [60, 40], hero: 0, villain: 1, dead: 0});
  close(a.required, 0.5, 1e-9);
  close(a.chipBreakeven, 0.5, 1e-9);
  close(a.tax, 0, 1e-9);
});

test("busting collects the prize for that finishing place (not zero)", () => {
  // three left, all paid: losing all-in means finishing 3rd = 20
  const a = I.callAnalysis({stacks: [1000, 1000, 1000], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 0});
  close(a.eLose, 20, 1e-9);
  // heads-up 60/40: losing means 2nd = 40, and the break-even is exactly a coin flip
  const hu = I.callAnalysis({stacks: [1000, 1000], payouts: [60, 40], hero: 0, villain: 1, dead: 0});
  close(hu.eLose, 40, 1e-9);
  close(hu.eWin, 60, 1e-9);
  // bubble (4 left, 3 paid): busting pays nothing
  const b = I.callAnalysis({stacks: [3000, 3000, 2000, 2000], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 0});
  close(b.eLose, 0, 1e-9);
});

test("covering vs being covered: hero only busts when the villain covers them", () => {
  const covered = I.callAnalysis({stacks: [2000, 5000, 3000], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 0});
  close(covered.eLose, 20, 1e-9, "hero busts to 3rd");
  const covers = I.callAnalysis({stacks: [5000, 2000, 3000], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 0});
  assert.ok(covers.eLose > 20, "hero survives with chips, worth more than 3rd place");
});

test("winner-take-all: required equity equals the chip break-even", () => {
  const a = I.callAnalysis({stacks: [4000, 3000, 3000], payouts: [100], hero: 0, villain: 1, dead: 500});
  close(a.required, a.chipBreakeven, 1e-9);
});

test("bubble: calling a bigger stack costs more than chip EV says", () => {
  // 4 players, 3 paid. Hero (mid stack) vs the chip leader; the short stack is nearly out.
  const a = I.callAnalysis({stacks: [3000, 6000, 2500, 500], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 0});
  assert.ok(a.required > a.chipBreakeven + 0.02, `required ${a.required.toFixed(3)} vs chip ${a.chipBreakeven.toFixed(3)}`);
  assert.equal(a.eff, 3000);
  assert.ok(a.eWin > a.eFold && a.eFold > a.eLose);
});

test("dead money lowers the price of a call", () => {
  const base = I.callAnalysis({stacks: [3000, 6000, 2500, 500], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 0});
  const dead = I.callAnalysis({stacks: [3000, 6000, 2500, 500], payouts: [50, 30, 20], hero: 0, villain: 1, dead: 900});
  assert.ok(dead.required < base.required);
  assert.ok(dead.chipBreakeven < base.chipBreakeven);
});

test("call analysis does not mutate the inputs", () => {
  const stacks = [3000, 6000, 2500, 500], payouts = [50, 30, 20];
  I.callAnalysis({stacks, payouts, hero: 0, villain: 1, dead: 100});
  assert.deepEqual(stacks, [3000, 6000, 2500, 500]);
  assert.deepEqual(payouts, [50, 30, 20]);
});

// ── input parsing ──
test("parseInputs accepts commas, spaces and ₱ signs", () => {
  const r = I.parseInputs("50,000".replace(",", "") + " 30000, ₱20000", "5000 3000\n2000");
  assert.deepEqual(r.stacks, [50000, 30000, 20000]);
  assert.deepEqual(r.payouts, [5000, 3000, 2000]);
});

test("parseInputs rejects bad input with a readable message", () => {
  assert.match(I.parseInputs("1000", "10").error, /at least two stacks/i);
  assert.match(I.parseInputs("1000 abc", "10").error, /"abc"/);
  assert.match(I.parseInputs("1000 0", "10").error, /two players need chips/i);
  assert.match(I.parseInputs("1000 2000", "").error, /prize/i);
  assert.match(I.parseInputs("1000 2000", "10 20").error, /increase/i);
  assert.match(I.parseInputs("1000 2000", "30 20 10").error, /More prizes/);
  assert.match(I.parseInputs(Array(13).fill(100).join(" "), "10").error, /up to 12/);
  assert.match(I.parseInputs("1000 -5", "10").error, /not a valid number/);
});
