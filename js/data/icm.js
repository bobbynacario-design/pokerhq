"use strict";

// ICM (Malmuth-Harville) for the Calc → ICM Calculator. Loaded as a classic
// script (window.PokerHQICM) and importable from Node for tests/icm.test.js.
//
// ICM turns chip stacks into prize-money equity: each player finishes 1st with
// probability stack/total, then the remaining players race for 2nd the same way,
// and so on. It's the standard model for bubble and final-table decisions — it
// says chips are worth less than dollars when you're near a pay jump.
(function (root) {
  var MAX_PLAYERS = 12;   // 2^n subsets: instant at 12, painful much past 14

  function popcount(x) {
    var c = 0;
    while (x) { x &= x - 1; c++; }
    return c;
  }

  // $ equity per player. stacks: chips per player (0 = out); payouts: prize for
  // 1st, 2nd, … (may be shorter than the field — unpaid places pay 0).
  function icm(stacks, payouts) {
    var n = stacks.length;
    if (n > MAX_PLAYERS) throw new Error("ICM supports up to " + MAX_PLAYERS + " players");
    var eq = new Array(n);
    for (var z = 0; z < n; z++) eq[z] = 0;
    var total = 0;
    for (var t = 0; t < n; t++) total += stacks[t];
    if (!(total > 0)) return eq;

    var places = Math.min(payouts.length, n);
    var size = 1 << n;
    var chips = new Float64Array(size);   // chips held by the players in each subset
    for (var m = 1; m < size; m++) {
      var low = m & -m;
      chips[m] = chips[m ^ low] + stacks[31 - Math.clz32(low)];
    }
    // ways[mask] = probability that exactly the players in `mask` fill the top
    // |mask| places, in any order. Every predecessor of a mask is numerically
    // smaller, so one ascending pass completes each entry before it is used.
    var ways = new Float64Array(size);
    ways[0] = 1;
    for (var mask = 0; mask < size; mask++) {
      var w = ways[mask];
      if (w === 0) continue;
      var k = popcount(mask);
      if (k >= places) continue;
      var remaining = total - chips[mask];
      if (!(remaining > 0)) continue;
      for (var i = 0; i < n; i++) {
        if (mask & (1 << i) || stacks[i] <= 0) continue;
        var p = w * (stacks[i] / remaining);
        eq[i] += p * payouts[k];
        ways[mask | (1 << i)] += p;
      }
    }
    return eq;
  }

  function withStack(stacks, index, value) {
    var copy = stacks.slice();
    copy[index] = value;
    return copy;
  }

  // Hero faces villain's all-in. What equity does hero need to call?
  //   fold: hero keeps their stack, villain collects the dead money
  //   win:  hero takes the pot; lose: villain takes it
  // Break-even p solves  p·E(win) + (1−p)·E(lose) = E(fold).
  // chipBreakeven is the same maths with chips instead of prize money, so the
  // gap between the two is the "ICM tax" on the call.
  function callAnalysis(opts) {
    var stacks = opts.stacks.slice();
    var payouts = opts.payouts;
    var hero = opts.hero, villain = opts.villain;
    var dead = Math.max(0, Number(opts.dead) || 0);
    var h = stacks[hero], v = stacks[villain];
    var eff = Math.min(h, v);
    var contenders = stacks.filter(function (x) { return x > 0; }).length;

    function scenario(heroChips, villainChips) {
      // Busting out isn't "earning nothing": hero is the first player out, so
      // they finish last among today's contenders and collect that place's prize.
      if (heroChips <= 0) return payouts[contenders - 1] || 0;
      var s = stacks.slice();
      s[hero] = heroChips;
      s[villain] = villainChips;
      return icm(s, payouts)[hero];
    }
    var eNow = icm(stacks, payouts)[hero];
    var eFold = scenario(h, v + dead);
    var eWin = scenario(h + eff + dead, v - eff);
    var eLose = scenario(h - eff, v + eff + dead);

    var chipBreakeven = eff > 0 ? eff / (2 * eff + dead) : 0;
    var gain = eWin - eLose;
    var required = gain > 0 ? (eFold - eLose) / gain : 1;
    return {
      eff: eff,
      eNow: eNow, eFold: eFold, eWin: eWin, eLose: eLose,
      chipBreakeven: chipBreakeven,
      required: Math.min(1, Math.max(0, required)),
      tax: Math.min(1, Math.max(0, required)) - chipBreakeven
    };
  }

  // "50000 30000, 20000" → [50000, 30000, 20000]; invalid → {error}
  function parseNumbers(text, label) {
    var parts = String(text || "").split(/[\s,;]+/).filter(Boolean);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var n = Number(parts[i].replace(/^₱/, ""));
      if (!isFinite(n) || n < 0) return { error: label + ': "' + parts[i] + '" is not a valid number.' };
      out.push(n);
    }
    return { values: out };
  }

  // Validate raw inputs and return either {error} or {stacks, payouts}.
  function parseInputs(stacksText, payoutsText) {
    var s = parseNumbers(stacksText, "Stacks");
    if (s.error) return s;
    var p = parseNumbers(payoutsText, "Payouts");
    if (p.error) return p;
    var alive = s.values.filter(function (x) { return x > 0; }).length;
    if (s.values.length < 2) return { error: "Enter at least two stacks." };
    if (alive < 2) return { error: "At least two players need chips." };
    if (s.values.length > MAX_PLAYERS) return { error: "ICM supports up to " + MAX_PLAYERS + " players." };
    if (!p.values.length) return { error: "Enter the prize for each paid place (1st, 2nd, …)." };
    if (p.values.length > s.values.length) return { error: "More prizes (" + p.values.length + ") than players (" + s.values.length + ")." };
    for (var i = 1; i < p.values.length; i++) {
      if (p.values[i] > p.values[i - 1]) return { error: "Prizes should not increase down the places (place " + (i + 1) + " pays more than place " + i + ")." };
    }
    return { stacks: s.values, payouts: p.values };
  }

  var api = {
    MAX_PLAYERS: MAX_PLAYERS,
    icm: icm,
    callAnalysis: callAnalysis,
    parseNumbers: parseNumbers,
    parseInputs: parseInputs
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQICM = api;
})(typeof window !== "undefined" ? window : undefined);
