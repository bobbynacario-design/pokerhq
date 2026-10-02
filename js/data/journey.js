"use strict";
(function(root) {
  function num(v) { v = parseFloat(v); return isFinite(v) ? v : null; }
  function build(session, hands) {
    var points = [];
    (Array.isArray(hands) ? hands : []).forEach(function(hand) {
      var m = hand && hand.marker, stack = m ? num(m.stack) : null, elapsed = m ? num(m.elapsedMs) : null;
      if (!m || stack === null) return;
      points.push({ id: hand.id, stack: stack, elapsedMs: elapsed === null ? 0 : Math.max(0, elapsed), level: String(m.level || ""), kind: String(m.kind || "spot"), title: String(hand.title || "Live marker") });
    });
    points.sort(function(a, b) { return a.elapsedMs - b.elapsedMs; });
    var peak = points.reduce(function(v, p) { return Math.max(v, p.stack); }, 0);
    var low = points.length ? points.reduce(function(v, p) { return Math.min(v, p.stack); }, points[0].stack) : 0;
    var biggestDrop = null;
    for (var i = 1; i < points.length; i++) { var delta = points[i].stack - points[i - 1].stack; if (!biggestDrop || delta < biggestDrop.delta) biggestDrop = { from: points[i - 1], to: points[i], delta: delta }; }
    return { points: points, peak: peak, low: low, biggestDrop: biggestDrop && biggestDrop.delta < 0 ? biggestDrop : null };
  }
  var api = { build: build };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PokerHQJourney = api;
})(typeof window !== "undefined" ? window : undefined);
