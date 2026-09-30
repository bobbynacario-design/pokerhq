"use strict";

// True tournament ROI: what poker paid you compared with everything it really cost you, trip costs
// included. Pure logic, loaded as a classic script (window.PokerHQTrueRoi) and importable from Node
// for tests/trueroi.test.js. The Treasury section that shows it is js/features/trips.js.
//
//   Poker ROI  = (winnings - buy-ins logged on sessions) / buy-ins           (the ROI the app already shows)
//   True ROI   = (winnings - everything you paid) / everything you paid
//   everything = cash buy-ins + satellite buy-ins + trip costs (flights, hotel, food ... in pesos)
//
// Satellites are the double-counting trap. A seat won in a satellite is not cash: what it cost you is
// the satellites you played for it, and those are already in the Satellites tracker. So a session
// marked `seatViaSatellite` contributes ₱0 of cash buy-in here (the satellites carry the cost), and
// every satellite buy-in is counted exactly once, in the trip it belongs to.
(function (root) {
  var CURRENCIES = [
    { code: "PHP", label: "Philippine peso" },
    { code: "USD", label: "US dollar" },
    { code: "TWD", label: "Taiwan dollar" },
    { code: "THB", label: "Thai baht" },
    { code: "VND", label: "Vietnamese dong" },
    { code: "SGD", label: "Singapore dollar" },
    { code: "MYR", label: "Malaysian ringgit" },
    { code: "HKD", label: "Hong Kong dollar" },
    { code: "MOP", label: "Macau pataca" },
    { code: "KRW", label: "Korean won" },
    { code: "JPY", label: "Japanese yen" },
    { code: "EUR", label: "Euro" },
    { code: "GBP", label: "British pound" },
    { code: "AUD", label: "Australian dollar" },
    { code: "IDR", label: "Indonesian rupiah" },
    { code: "CNY", label: "Chinese yuan" }
  ];
  var CATEGORIES = [
    { id: "flight", label: "Flights", icon: "✈️" },
    { id: "hotel", label: "Hotel", icon: "🏨" },
    { id: "transport", label: "Transport", icon: "🚕" },
    { id: "food", label: "Food", icon: "🍜" },
    { id: "visa", label: "Visa & fees", icon: "🛂" },
    { id: "tips", label: "Tips", icon: "💵" },
    { id: "other", label: "Other", icon: "🧾" }
  ];
  var MAX_NAME = 60, MAX_NOTE = 300, MAX_DESC = 80;

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isDate(s) {
    var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }
  function day(s) { return String(s || "").slice(0, 10); }

  function currencyCode(code) {
    var c = String(code || "PHP").trim().toUpperCase();
    return CURRENCIES.some(function (x) { return x.code === c; }) ? c : null;
  }
  function categoryById(id) {
    return CATEGORIES.filter(function (c) { return c.id === id; })[0] || null;
  }

  // ── costs in pesos ──
  // PHP value of a cost. A foreign amount with no usable rate is not converted (and not counted) yet.
  function expensePhp(e) {
    if (!e) return { php: 0, converted: true };
    var amount = num(e.amount);
    var cur = currencyCode(e.currency) || "PHP";
    if (cur === "PHP") return { php: round2(amount), converted: true };
    var rate = num(e.rate);
    if (rate > 0) return { php: round2(amount * rate), converted: true };
    return { php: 0, converted: false };
  }

  // Validates a cost from the form. Returns {ok:true, expense} or {ok:false, message}.
  function normalizeExpense(input) {
    var i = input || {};
    var amount = num(i.amount);
    if (!(amount > 0)) return { ok: false, message: "Enter an amount above zero." };
    var currency = currencyCode(i.currency);
    if (!currency) return { ok: false, message: "That currency is not in the list." };
    if (!isDate(i.date)) return { ok: false, message: "Pick the date you paid." };
    var tripId = i.tripId;
    if (tripId === null || typeof tripId === "undefined" || tripId === "") return { ok: false, message: "Pick the trip this cost belongs to." };
    var e = {
      id: i.id,
      tripId: tripId,
      date: i.date,
      category: categoryById(i.category) ? i.category : "other",
      description: String(i.description || "").replace(/\s+/g, " ").trim().slice(0, MAX_DESC),
      amount: round2(amount),
      currency: currency
    };
    if (currency !== "PHP") {
      var rate = num(i.rate);
      if (!(rate > 0)) return { ok: false, message: "Enter the exchange rate: how many pesos one " + currency + " is worth." };
      e.rate = Math.round(rate * 10000) / 10000;
    }
    return { ok: true, expense: e };
  }

  // Validates a trip from the form. rates: {USD: 58.2} are the default exchange rates for its costs.
  function normalizeTrip(input) {
    var i = input || {};
    var name = String(i.name || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
    if (!name) return { ok: false, message: "Give the trip a name." };
    if (!isDate(i.start) || !isDate(i.end)) return { ok: false, message: "Pick the first and last day of the trip." };
    if (i.end < i.start) return { ok: false, message: "The last day is before the first day." };
    var rates = {};
    var given = i.rates && typeof i.rates === "object" ? i.rates : {};
    Object.keys(given).forEach(function (code) {
      var c = currencyCode(code), r = num(given[code]);
      if (c && c !== "PHP" && r > 0) rates[c] = Math.round(r * 10000) / 10000;
    });
    return { ok: true, trip: { id: i.id, name: name, start: i.start, end: i.end, notes: String(i.notes || "").trim().slice(0, MAX_NOTE), rates: rates } };
  }

  // The rate to suggest for a cost: the trip's own, else the newest other trip that has one.
  function defaultRate(trip, currency, trips) {
    var c = currencyCode(currency);
    if (!c || c === "PHP") return null;
    if (trip && trip.rates && num(trip.rates[c]) > 0) return num(trip.rates[c]);
    var others = arr(trips).filter(function (t) { return t && t.rates && num(t.rates[c]) > 0; })
      .sort(function (a, b) { return String(b.start).localeCompare(String(a.start)); });
    return others.length ? num(others[0].rates[c]) : null;
  }

  // ── which trip does a session / satellite belong to ──
  // record.tripId: unset = by date, "none" = never on a trip, an id = that trip (if it still exists).
  function tripFor(record, trips) {
    if (!record) return null;
    var list = arr(trips).filter(function (t) { return t && isDate(t.start) && isDate(t.end); });
    if (record.tripId === "none") return null;
    if (record.tripId !== undefined && record.tripId !== null && record.tripId !== "") {
      var chosen = list.filter(function (t) { return String(t.id) === String(record.tripId); })[0];
      if (chosen) return chosen;
    }
    var d = day(record.date);
    if (!isDate(d)) return null;
    var hits = list.filter(function (t) { return d >= t.start && d <= t.end; });
    // overlapping trips: the one that started last is the more specific
    hits.sort(function (a, b) { return String(b.start).localeCompare(String(a.start)) || (num(a.id) - num(b.id)); });
    return hits[0] || null;
  }

  // What a session cost in cash. A seat won in a satellite cost nothing here: its satellites did.
  function sessionCash(s) {
    if (!s) return 0;
    return s.seatViaSatellite === true ? 0 : num(s.total);
  }

  function nameKey(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

  // A satellite that is probably also logged as a session: same day, same buy-in, similar name.
  // Counting both would count it twice.
  function possibleDuplicates(sessions, satellites) {
    var out = [];
    arr(satellites).forEach(function (sat) {
      if (!sat || !(num(sat.buyin) > 0)) return;
      arr(sessions).forEach(function (s) {
        if (!s || s.seatViaSatellite === true) return;
        if (day(s.date) !== day(sat.date) || num(s.total) !== num(sat.buyin)) return;
        var a = nameKey(sat.name), b = nameKey(s.name);
        if (a && b && (a === b || a.indexOf(b) !== -1 || b.indexOf(a) !== -1)) out.push({ satelliteId: sat.id, sessionId: s.id, name: sat.name || s.name, date: day(sat.date), buyin: num(sat.buyin) });
      });
    });
    return out;
  }

  // scope: {sessions, satellites, expenses}, already limited to what belongs together (a trip, or everything).
  function summarize(scope) {
    var sc = scope || {};
    var sessions = arr(sc.sessions).filter(Boolean), satellites = arr(sc.satellites).filter(Boolean), expenses = arr(sc.expenses).filter(Boolean);
    var pokerInvested = 0, cashBuyins = 0, returned = 0, seatSessions = 0;
    sessions.forEach(function (s) {
      pokerInvested += num(s.total);
      cashBuyins += sessionCash(s);
      returned += num(s.prize) + num(s.bounties);
      if (s.seatViaSatellite === true) seatSessions++;
    });
    var satelliteSpend = 0;
    satellites.forEach(function (sat) { satelliteSpend += num(sat.buyin); });
    var expensePesos = 0, unconverted = 0, cats = {};
    expenses.forEach(function (e) {
      var v = expensePhp(e);
      if (!v.converted) { unconverted++; return; }
      expensePesos += v.php;
      var id = categoryById(e.category) ? e.category : "other";
      cats[id] = (cats[id] || 0) + v.php;
    });
    var trueCost = cashBuyins + satelliteSpend + expensePesos;
    var pokerPnl = returned - pokerInvested;
    var truePnl = returned - trueCost;
    var byCategory = CATEGORIES.filter(function (c) { return cats[c.id] > 0; })
      .map(function (c) { return { id: c.id, label: c.label, icon: c.icon, php: round2(cats[c.id]) }; })
      .sort(function (a, b) { return b.php - a.php; });
    var warnings = [];
    if (unconverted) warnings.push({ code: "unconverted", count: unconverted, text: unconverted + " cost" + (unconverted === 1 ? " has" : "s have") + " no exchange rate, so " + (unconverted === 1 ? "it is" : "they are") + " not counted yet." });
    if (seatSessions && satelliteSpend === 0) warnings.push({ code: "seat-no-satellites", count: seatSessions, text: seatSessions + " session" + (seatSessions === 1 ? " is" : "s are") + " marked as a satellite seat, but no satellites are counted here, so " + (seatSessions === 1 ? "its" : "their") + " entry cost is ₱0. Log the satellites you played for it." });
    var dupes = possibleDuplicates(sessions, satellites);
    dupes.forEach(function (d) { warnings.push({ code: "possible-double-count", satelliteId: d.satelliteId, sessionId: d.sessionId, text: "\"" + d.name + "\" on " + d.date + " is in both your satellites and your sessions. If it is the same one, mark the session as a satellite seat or delete one, so it is counted once." }); });
    return {
      sessions: sessions.length,
      seatSessions: seatSessions,
      pokerInvested: round2(pokerInvested),
      returned: round2(returned),
      pokerPnl: round2(pokerPnl),
      pokerRoi: pokerInvested > 0 ? round1(pokerPnl / pokerInvested * 100) : null,
      cashBuyins: round2(cashBuyins),
      satelliteSpend: round2(satelliteSpend),
      satellites: satellites.length,
      expenses: round2(expensePesos),
      expenseCount: expenses.length,
      unconverted: unconverted,
      byCategory: byCategory,
      trueCost: round2(trueCost),
      truePnl: round2(truePnl),
      // no ROI for a trip nobody has played yet: costs with no sessions is not a -100% result, it is a plan
      trueRoi: trueCost > 0 && sessions.length > 0 ? round1(truePnl / trueCost * 100) : null,
      warnings: warnings
    };
  }

  // Sorts everything into its trip and summarises each, plus what is on no trip, plus the grand total.
  // The pieces always add up to the total: a session or satellite belongs to exactly one place.
  function partition(input) {
    var i = input || {};
    var trips = arr(i.trips).filter(function (t) { return t && isDate(t.start) && isDate(t.end); });
    var buckets = {};
    var key = function (t) { return "t" + t.id; };
    trips.forEach(function (t) { buckets[key(t)] = { sessions: [], satellites: [], expenses: [] }; });
    var loose = { sessions: [], satellites: [], expenses: [] };
    arr(i.sessions).filter(Boolean).forEach(function (s) { var t = tripFor(s, trips); (t ? buckets[key(t)] : loose).sessions.push(s); });
    arr(i.satellites).filter(Boolean).forEach(function (s) { var t = tripFor(s, trips); (t ? buckets[key(t)] : loose).satellites.push(s); });
    arr(i.expenses).filter(Boolean).forEach(function (e) {
      var t = trips.filter(function (x) { return String(x.id) === String(e.tripId); })[0];
      (t ? buckets[key(t)] : loose).expenses.push(e);       // a cost whose trip was deleted is kept, on "no trip"
    });
    var ordered = trips.slice().sort(function (a, b) { return String(b.start).localeCompare(String(a.start)) || (num(b.id) - num(a.id)); });
    return {
      trips: ordered.map(function (t) { return { trip: t, summary: summarize(buckets[key(t)]) }; }),
      unassigned: summarize(loose),
      overall: summarize({ sessions: arr(i.sessions), satellites: arr(i.satellites), expenses: arr(i.expenses) })
    };
  }

  // ── wording ──
  function groupDigits(n, maxDecimals) {
    var v = Math.round(Math.abs(n) * Math.pow(10, maxDecimals)) / Math.pow(10, maxDecimals);
    return v.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
  }
  function formatPeso(n) { return (n < 0 ? "−₱" : "₱") + groupDigits(n, 0); }
  function formatAmount(amount, currency) {
    var c = currencyCode(currency) || "PHP";
    return c === "PHP" ? formatPeso(num(amount)) : c + " " + groupDigits(num(amount), 2);
  }
  // "USD 420 × 58.2 = ₱24,444", or just "₱3,500" for pesos.
  function describeExpense(e) {
    var c = currencyCode(e && e.currency) || "PHP";
    var v = expensePhp(e);
    if (c === "PHP") return formatPeso(v.php);
    if (!v.converted) return formatAmount(e.amount, c) + " · needs a rate";
    return formatAmount(e.amount, c) + " × " + groupDigits(num(e.rate), 4) + " = " + formatPeso(v.php);
  }
  function formatRoi(pct) { return pct === null || typeof pct === "undefined" ? "—" : (pct > 0 ? "+" : pct < 0 ? "−" : "") + Math.abs(pct).toFixed(1) + "%"; }

  var api = {
    CURRENCIES: CURRENCIES,
    CATEGORIES: CATEGORIES,
    currencyCode: currencyCode,
    categoryById: categoryById,
    isDate: isDate,
    expensePhp: expensePhp,
    normalizeExpense: normalizeExpense,
    normalizeTrip: normalizeTrip,
    defaultRate: defaultRate,
    tripFor: tripFor,
    sessionCash: sessionCash,
    possibleDuplicates: possibleDuplicates,
    summarize: summarize,
    partition: partition,
    formatPeso: formatPeso,
    formatAmount: formatAmount,
    describeExpense: describeExpense,
    formatRoi: formatRoi
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQTrueRoi = api;
})(typeof window !== "undefined" ? window : undefined);
