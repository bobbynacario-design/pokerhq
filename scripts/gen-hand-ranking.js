"use strict";
// Generates the 169-hand push/fold ordering embedded in js/data/pushfold.js.
//
// Stage 1: equity of every starting-hand class vs a random hand.
// Stage 2: take the top 22% of combos from stage 1 as a stand-in for the range
//          that calls a shove, then rank every class by equity vs THAT range.
// Ranking against a calling range (not a random hand) is what puts small pairs
// and suited aces where push/fold charts put them.
//
// Deterministic (seeded). Run: node scripts/gen-hand-ranking.js

const RANKS = "23456789TJQKA";
const SAMPLES_STAGE1 = 30000;
const SAMPLES_STAGE2 = 30000;
const CALL_RANGE_PCT = 0.22;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260929);

// card = rank(0..12) * 4 + suit(0..3)
const rankOf = (c) => c >> 2;
const suitOf = (c) => c & 3;

function straightHigh(mask) {
  // mask: bit r set if rank r present. Returns high rank of best straight or -1.
  for (let hi = 12; hi >= 4; hi--) {
    const need = 0x1F << (hi - 4);
    if ((mask & need) === need) return hi;
  }
  // wheel A-2-3-4-5
  if ((mask & 0x100F) === 0x100F) return 3;
  return -1;
}

// Returns a comparable integer: category * 13^5 + tiebreak digits (base 13).
function score7(cards) {
  const rc = new Array(13).fill(0);
  const sc = [0, 0, 0, 0];
  let mask = 0;
  const bySuit = [0, 0, 0, 0];
  for (const c of cards) {
    const r = rankOf(c), s = suitOf(c);
    rc[r]++; sc[s]++; mask |= 1 << r; bySuit[s] |= 1 << r;
  }
  const B = 13;
  const pack = (cat, arr) => {
    let v = cat;
    for (let i = 0; i < 5; i++) v = v * B + (arr[i] || 0);
    return v;
  };
  // flush / straight flush
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightHigh(bySuit[flushSuit]);
    if (sf >= 0) return pack(8, [sf]);
  }
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quads.push(r);
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
    else if (rc[r] === 1) singles.push(r);
  }
  if (quads.length) {
    const kick = [...trips, ...pairs, ...singles].sort((a, b) => b - a)[0];
    return pack(7, [quads[0], kick]);
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = trips.length > 1 ? Math.max(trips[1], pairs[0] === undefined ? -1 : pairs[0]) : pairs[0];
    return pack(6, [t, p]);
  }
  if (flushSuit >= 0) {
    const ranks = [];
    for (let r = 12; r >= 0; r--) if (bySuit[flushSuit] & (1 << r)) ranks.push(r);
    return pack(5, ranks.slice(0, 5));
  }
  const st = straightHigh(mask);
  if (st >= 0) return pack(4, [st]);
  if (trips.length) return pack(3, [trips[0], ...singles.concat(pairs).sort((a, b) => b - a).slice(0, 2)]);
  if (pairs.length >= 2) {
    const kick = [...(pairs.length > 2 ? [pairs[2]] : []), ...singles].sort((a, b) => b - a)[0];
    return pack(2, [pairs[0], pairs[1], kick]);
  }
  if (pairs.length === 1) return pack(1, [pairs[0], ...singles.slice(0, 3)]);
  return pack(0, singles.slice(0, 5));
}

function className(hi, lo, suited) {
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suited ? "s" : "o");
}

function combosOf(hi, lo, suited) {
  const out = [];
  if (hi === lo) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) out.push([hi * 4 + a, lo * 4 + b]);
  } else if (suited) {
    for (let s = 0; s < 4; s++) out.push([hi * 4 + s, lo * 4 + s]);
  } else {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) out.push([hi * 4 + a, lo * 4 + b]);
  }
  return out;
}

const CLASSES = [];
for (let hi = 12; hi >= 0; hi--) {
  for (let lo = hi; lo >= 0; lo--) {
    if (hi === lo) CLASSES.push({ hi, lo, suited: false, name: className(hi, lo, false) });
    else {
      CLASSES.push({ hi, lo, suited: true, name: className(hi, lo, true) });
      CLASSES.push({ hi, lo, suited: false, name: className(hi, lo, false) });
    }
  }
}
CLASSES.forEach((c) => { c.combos = combosOf(c.hi, c.lo, c.suited); });

const ALL_COMBOS = [];
CLASSES.forEach((c) => c.combos.forEach((cb) => ALL_COMBOS.push({ cls: c, cards: cb })));

function equityVsRange(heroCards, oppCombos, samples) {
  let win = 0, n = 0;
  const dead = new Set(heroCards);
  const deck = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
  while (n < samples) {
    const opp = oppCombos[(rand() * oppCombos.length) | 0].cards;
    if (dead.has(opp[0]) || dead.has(opp[1])) continue;
    // draw 5 board cards from deck minus opp
    const avail = deck.filter((c) => c !== opp[0] && c !== opp[1]);
    for (let i = 0; i < 5; i++) {
      const j = i + ((rand() * (avail.length - i)) | 0);
      const t = avail[i]; avail[i] = avail[j]; avail[j] = t;
    }
    const board = avail.slice(0, 5);
    const h = score7([heroCards[0], heroCards[1], ...board]);
    const o = score7([opp[0], opp[1], ...board]);
    if (h > o) win += 1; else if (h === o) win += 0.5;
    n++;
  }
  return win / samples;
}

// ── sanity checks against well-known equities ───────────────────────────
function check(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  console.log((ok ? "ok  " : "FAIL") + " " + name + " = " + (got * 100).toFixed(1) + "% (expect ~" + (want * 100).toFixed(1) + "%)");
  if (!ok) process.exitCode = 1;
}
{
  const byName = (n) => CLASSES.find((c) => c.name === n);
  check("AA vs random", equityVsRange(byName("AA").combos[0], ALL_COMBOS, 60000), 0.852, 0.01);
  check("72o vs random", equityVsRange(byName("72o").combos[0], ALL_COMBOS, 60000), 0.346, 0.01);
  check("AKs vs random", equityVsRange(byName("AKs").combos[0], ALL_COMBOS, 60000), 0.670, 0.01);
  check("22 vs random", equityVsRange(byName("22").combos[0], ALL_COMBOS, 60000), 0.503, 0.01);
}

// ── stage 1: vs random ──────────────────────────────────────────────────
CLASSES.forEach((c) => { c.eqRandom = equityVsRange(c.combos[0], ALL_COMBOS, SAMPLES_STAGE1); });
const stage1 = CLASSES.slice().sort((a, b) => b.eqRandom - a.eqRandom);

// Calling range = top CALL_RANGE_PCT of combos by stage-1 equity.
const target = Math.round(1326 * CALL_RANGE_PCT);
let acc = 0;
const callCombos = [];
for (const c of stage1) {
  if (acc >= target) break;
  c.combos.forEach((cb) => callCombos.push({ cls: c, cards: cb }));
  acc += c.combos.length;
}

// ── stage 2: vs the calling range ───────────────────────────────────────
CLASSES.forEach((c) => { c.eqCall = equityVsRange(c.combos[0], callCombos, SAMPLES_STAGE2); });
const ranked = CLASSES.slice().sort((a, b) => b.eqCall - a.eqCall);

console.log("\nCalling range: " + callCombos.length + " combos (" + ((callCombos.length / 1326) * 100).toFixed(1) + "%)");
console.log("\nORDER = " + JSON.stringify(ranked.map((c) => c.name)));
console.log("\nTop 30: " + ranked.slice(0, 30).map((c) => c.name + " " + (c.eqCall * 100).toFixed(0)).join(", "));
console.log("Bottom 10: " + ranked.slice(-10).map((c) => c.name).join(", "));
