"use strict";

// The Daily Drill on HOME: one small, poker-specific thing to do today (in 2 minutes
// or in 10), picked from a library and steered by what's going on in the app. Pure
// functions — the card itself is js/features/daily-drill.js. Loaded as a classic
// script (window.PokerHQDrills) and importable from Node for tests/drills.test.js.
(function (root) {
  var CATEGORIES = {
    prep: "Pre-game",
    preflop: "Preflop",
    postflop: "Postflop",
    icm: "ICM & bubble",
    mental: "Mental game",
    bankroll: "Bankroll",
    review: "Review",
    live: "Live table"
  };

  // "What do you need today?" — which themes each answer draws from (null = all).
  var MOODS = [
    { key: "surprise", label: "Surprise me", cats: null },
    { key: "ready", label: "Get ready to play", cats: ["prep", "live"] },
    { key: "sharpen", label: "Sharpen my game", cats: ["preflop", "postflop", "icm"] },
    { key: "steady", label: "Steady my head", cats: ["mental"] },
    { key: "study", label: "Study a spot", cats: ["review", "postflop", "icm"] },
    { key: "protect", label: "Protect my bankroll", cats: ["bankroll"] }
  ];

  // Where a drill's button can take you. Handled by the card (daily-drill.js).
  var ACTIONS = ["advisor", "icm", "payout", "risk", "hands", "history", "heatmap", "calendar", "satellites", "treasury", "strategy", "opponents", "play", "home"];

  function d(id, cat, title, light, deep, go) {
    return { id: id, cat: cat, title: title, light: light, deep: deep, go: go || null };
  }
  function g(action, label) { return { action: action, label: label }; }

  var DRILLS = [
    // ── Pre-game ──
    d("prep-rules", "prep", "Set tonight's rules before the first hand",
      "Decide out loud: your stop-loss, how many re-entries you'll fire, and when you quit. Say it once.",
      "Write a four-line plan: buy-in cap, re-entry limit, quit time, and what a good night looks like. Take a screenshot of it.",
      g("calendar", "OPEN CALENDAR")),
    d("prep-structure", "prep", "Read the structure sheet",
      "Find the starting stack, the level length, and the level where you'll first be at 30bb or less.",
      "Map the whole day: break times, when late registration closes, and the level where the money bubble usually bursts.",
      g("calendar", "OPEN CALENDAR")),
    d("prep-body", "prep", "Body check before you sit",
      "Rate your energy, focus and hunger from 1 to 10. Fix the lowest one (food, water, a short walk) before the first hand.",
      "Plan the day's fuel: a proper meal 90 minutes before, water at every break, and nothing heavy or sugary mid-level."),
    d("prep-orbits", "prep", "Plan your first three orbits",
      "Pick one thing to watch for early: who opens too wide, and who folds to a 3-bet.",
      "Decide your early-level style, and the exact stack sizes where you'll change gears."),
    d("prep-bag", "prep", "Pack the small stuff",
      "Cash for re-entries, ID, charger, a snack, headphones. Check the bag, not your memory.",
      "Build a permanent tournament checklist in your notes app and tick it off every time you leave the house."),
    d("prep-target", "prep", "Name tonight's goal (it isn't \"win\")",
      "Write one process goal for tonight: no tilt-calls, or three orbits watched before any bluff.",
      "Set one process goal and one result goal, and decide how you'll grade the night afterwards."),
    d("prep-latereg", "prep", "Do the late-registration maths",
      "Compare sitting down now against arriving later: your stack in big blinds, and the fold equity you'd give up.",
      "Work out your ideal arrival level for each event you're considering and note it on the calendar.",
      g("calendar", "OPEN CALENDAR")),

    // ── Preflop ──
    d("pre-pushfold", "preflop", "Push/fold spot check",
      "Pick a stack between 8 and 12bb and a seat. Decide your shove range first, then check it in the Advisor.",
      "Run ten different stack-and-seat spots in the Stack & Bubble Advisor. Write down every one you got wrong.",
      g("advisor", "OPEN ADVISOR")),
    d("pre-open", "preflop", "Recite your opening ranges",
      "Say your opening range from UTG, the cutoff and the button. Where do they overlap?",
      "Write all three ranges from memory, then compare them with a solver chart and circle the differences."),
    d("pre-3bet", "preflop", "Build a 3-bet defence plan",
      "Pick one seat and decide which hands you call, 4-bet and fold against a 3-bet.",
      "Write the plan for two seats, then find three 3-bet pots in your history and check them against it.",
      g("hands", "OPEN HANDS")),
    d("pre-bb", "preflop", "Big-blind defence",
      "Facing a min-raise, which offsuit hands do you still call with? Name three and say why.",
      "List your big-blind defence against a min-raise, a 2.5x and a 3x. Note how much the price changes the range."),
    d("pre-antes", "preflop", "Antes change everything",
      "How much wider do you shove once antes kick in at 10bb? Guess, then check the Advisor with antes on.",
      "Compare push ranges with and without antes at 6, 10 and 14bb, and note where the biggest jump is.",
      g("advisor", "OPEN ADVISOR")),
    d("pre-squeeze", "preflop", "Squeeze spots",
      "One open and one caller ahead of you: which hands squeeze and which just call? Pick your best three.",
      "Write a squeeze range and a sizing for two seats, then find a hand in your log where you missed one.",
      g("hands", "OPEN HANDS")),
    d("pre-limp", "preflop", "Have a plan for limpers",
      "Decide how you'll size an isolation raise over one limper, and over two.",
      "Write your isolation sizes by position and stack depth, and what changes when the limper is a calling station.",
      g("opponents", "OPEN OPPONENTS")),

    // ── Postflop ──
    d("post-odds", "postflop", "Say the pot odds out loud",
      "Next time you face a bet, say the price aloud: \"I need 25%.\" Then decide.",
      "Take five calls from your hand log and compare the odds you got with the equity you had.",
      g("hands", "OPEN HANDS")),
    d("post-cbet", "postflop", "Why did you c-bet?",
      "Before your next c-bet, name the reason: value, protection or fold equity. No reason, no bet.",
      "Review five c-bets from your log and label each one. Which reason costs you the most money?",
      g("hands", "OPEN HANDS")),
    d("post-texture", "postflop", "Sort the board",
      "Take any flop: is it dry, wet or paired? Who does it favour, you or the caller?",
      "Sort ten flops into dry, wet and paired, and write your default c-bet frequency and size for each."),
    d("post-river", "postflop", "River bluff-catcher maths",
      "Pick a river bet size and say how often the villain must bluff for a call to break even.",
      "Work out the bluff frequency you need against 33%, 50%, 75% and pot-sized bets, and keep the table on your phone."),
    d("post-blockers", "postflop", "Blockers first",
      "Find one hand where a card you hold makes a bluff better or a call worse. Say why.",
      "Go through five river spots from your log and rate each for blockers. Would you play any of them differently?",
      g("hands", "OPEN HANDS")),
    d("post-position", "postflop", "Play the position, not the cards",
      "Next orbit, note every pot you play out of position. Was each one worth it?",
      "Count your out-of-position and in-position pots from your last session and see which group made you money."),
    d("post-sizing", "postflop", "One sizing rule",
      "Choose one bet size for one street and stick to it for the whole day. Notice how it feels.",
      "Write your sizing rules for the flop, turn and river, then test them against three real hands.",
      g("hands", "OPEN HANDS")),

    // ── ICM & bubble ──
    d("icm-bubble", "icm", "Bubble fold equity",
      "Three off the bubble: who is short and who is covered? Decide whose stack you'd attack.",
      "Enter a bubble spot in the ICM Calculator and see how much equity a call really costs.",
      g("icm", "OPEN ICM CALCULATOR")),
    d("icm-ladder", "icm", "Read the pay ladder",
      "Open the prize pool and find the biggest jump between two places. That's the pay jump that matters.",
      "Break down the pay ladder for your next event and note where the ICM pressure starts.",
      g("payout", "OPEN PRIZE POOL")),
    d("icm-final", "icm", "Final-table pressure",
      "Six left with a medium stack: would you rather be big or short? Decide who gets your respect.",
      "Run a six-handed final table in the ICM Calculator and watch how each stack's equity shifts.",
      g("icm", "OPEN ICM CALCULATOR")),
    d("icm-lead", "icm", "When you have the chip lead",
      "List two ICM spots where the big stack should apply pressure. What do the short stacks fear?",
      "Model a chip-lead spot in the calculator and find the widest range you can profitably shove.",
      g("icm", "OPEN ICM CALCULATOR")),
    d("icm-call", "icm", "Calling a shove: chips vs ICM",
      "Pick a stack pair and ask: chip EV says call, ICM says fold. By how many percentage points?",
      "Run five calling spots in the ICM Calculator and note the equity you needed each time.",
      g("icm", "OPEN ICM CALCULATOR")),
    d("icm-sat", "icm", "Satellite mode",
      "In a satellite, what is a chip worth once your seat is safe? Write it in one line.",
      "Go through your last satellites and check you weren't playing for chips when the seat was already yours.",
      g("satellites", "OPEN SATELLITES")),
    d("icm-short", "icm", "Short-stack survival",
      "You have 8bb. Which pay jump would make you fold a marginal shove? Decide it now.",
      "List the pay jumps in your next event and set your shove range before each one.",
      g("advisor", "OPEN ADVISOR")),

    // ── Mental game ──
    d("men-tilt", "mental", "Name your tilt trigger",
      "Write the one situation that tilts you most, and the first thing you'll do next time (stand up, breathe, walk).",
      "List your top three tilt triggers, your early warning sign for each, and a plan you can use mid-hand."),
    d("men-breath", "mental", "Four slow breaths",
      "Before your next big decision, take four slow breaths: in for four, out for six.",
      "Practise the breathing for five minutes now, so it's automatic when you're at the table."),
    d("men-results", "mental", "Results vs decisions",
      "Take your last bad beat and write: \"The decision was ___.\" Then grade only the decision.",
      "Pick three recent hands with different results and grade only the decisions. How often did the grade match the result?",
      g("hands", "OPEN HANDS")),
    d("men-bust", "mental", "Plan your bust-out routine",
      "Decide what you'll do in the first ten minutes after busting: walk, water, no phone.",
      "Write a bust-out routine: what you check, what you don't, and when you'll review the hand."),
    d("men-next", "mental", "Only the next hand",
      "Write \"next hand\" on a note. When you feel the heat, that's your only job.",
      "Replay your last tough moment and rewrite what a calm version of you would have done."),
    d("men-wins", "mental", "Three things you did well",
      "Name three things you did well in your last session. Decisions, not results.",
      "Write a confidence list from your last five sessions and keep it where you'll read it before you play.",
      g("history", "OPEN HISTORY")),
    d("men-checkin", "mental", "Quick check-in",
      "Rate focus, energy and sleep from 1 to 10 right now. Anything under 5 is today's homework.",
      "Do the full mental and physical check-in on the session form and compare it with your best sessions.",
      g("play", "OPEN LOG SESSION")),

    // ── Bankroll ──
    d("bank-shots", "bankroll", "Count your shots",
      "How many buy-ins at your usual level can your bankroll cover? If it's under 15, what changes?",
      "Run the Bankroll Risk calculator for your favourite buy-in and write down your risk of ruin.",
      g("risk", "OPEN BANKROLL RISK")),
    d("bank-moveup", "bankroll", "Write your move-up rule",
      "Finish this sentence: \"I move up when ___ and down when ___.\"",
      "Turn it into numbers: bankroll size, number of shots and a review date. Put the date in your calendar.",
      g("calendar", "OPEN CALENDAR")),
    d("bank-ledger", "bankroll", "Tidy the ledger",
      "Log any top-up, withdrawal or expense you haven't recorded yet.",
      "Reconcile the Treasury with your real wallet and bankroll and fix any difference.",
      g("treasury", "OPEN TREASURY")),
    d("bank-stoploss", "bankroll", "Set a weekly stop-loss",
      "Pick the most you're willing to lose this week and write it down.",
      "Set stop-losses for the session, the week and the month, and decide what you'll do when you hit each one."),
    d("bank-downswing", "bankroll", "Prepare for the next downswing",
      "Guess your longest losing streak, then find your real one in your history.",
      "Study your worst downswing: how many buy-ins, how long, and what you did. Write your plan for the next one.",
      g("history", "OPEN HISTORY")),
    d("bank-package", "bankroll", "Check your markup and share",
      "For your next event: what's your markup, your share, and your net cost? Write the number.",
      "Review one backed or packaged event from start to finish, including who is owed what.",
      g("play", "OPEN LOG SESSION")),
    d("bank-roi", "bankroll", "Which buy-in level pays?",
      "Which buy-in range has your best ROI so far? Guess, then look.",
      "Check ROI by buy-in level on your dashboard and decide whether to play more or fewer events there.",
      g("home", "OPEN DASHBOARD")),

    // ── Review ──
    d("rev-hand", "review", "Log one hand",
      "Log one hand you're not sure about from your last session. Two lines is enough.",
      "Log three hands with the villain's likely range for each, then rate every decision.",
      g("hands", "OPEN HANDS")),
    d("rev-debrief", "review", "Debrief your last session",
      "Answer one question: what would you do differently in your biggest pot?",
      "Do the full debrief for your last session: the key hands, your mental state, and one lesson to lock in.",
      g("history", "OPEN HISTORY")),
    d("rev-leak", "review", "One leak, one fix",
      "Name your biggest leak, then write one sentence on how you'll plug it this week.",
      "Look at your last ten sessions for a pattern, then write down the leak and a drill to fix it.",
      g("heatmap", "OPEN HEATMAP")),
    d("rev-bigpot", "review", "Replay your biggest pot",
      "Replay your biggest pot from your last session in your head, street by street.",
      "Write it out decision by decision, and put a range on the villain at every street.",
      g("hands", "OPEN HANDS")),
    d("rev-villain", "review", "Note a villain",
      "Add one opponent you remember: how they play, and one way to exploit them.",
      "Update your villain notes for everyone you met last session and tag their styles.",
      g("opponents", "OPEN OPPONENTS")),
    d("rev-lesson", "review", "Lock in a lesson",
      "Write one lesson from this week in a single sentence.",
      "Add a study note in Strategy with the lesson, an example hand, and how you'll apply it.",
      g("strategy", "OPEN STRATEGY")),
    d("rev-heatmap", "review", "Read the heatmap",
      "Open the heatmap and find your best and your worst venue. Anything surprising?",
      "Check the venue, buy-in and weekday patterns and decide one thing to play more of and one to play less.",
      g("heatmap", "OPEN HEATMAP")),

    // ── Live table ──
    d("live-table", "live", "Read the table",
      "At your next break, name the loosest and the tightest player at your table.",
      "Keep a note on everyone who plays more than 40% of hands and add them to your villain notes.",
      g("opponents", "OPEN OPPONENTS")),
    d("live-stacks", "live", "Watch the stacks",
      "Before you act, count the effective stack in big blinds. Every hand.",
      "Practise estimating stacks in big blinds for a whole orbit, then check your guesses against a real count."),
    d("live-sizing", "live", "Bet-sizing tells",
      "Notice one player whose bet size changes with hand strength. Write down what you saw.",
      "Track sizing patterns for two players over a level and note what you think they mean."),
    d("live-image", "live", "What's your table image?",
      "How do they see you: tight, loose or wild? Use that in your next big decision.",
      "Note how your image changed over the day and one adjustment you made because of it."),
    d("live-seat", "live", "Seat selection",
      "When the table breaks, decide where you'd rather sit: left of the aggressor, or right of the passive player?",
      "List the seats you prefer and why, then check that against your results at those seats."),
    d("live-clock", "live", "Use the clock on purpose",
      "Decide now which decisions deserve a long think, before they come up.",
      "Plan how long you'll take on big decisions so you never rush or stall, and stick to it for one level."),
    d("live-rooms", "live", "Rooms and rhythms",
      "Pick the room you'll play next: how fast does it play, and how do late-registration fields behave?",
      "Write a quick profile of your two most-played rooms: pace, typical field, and the common leaks.")
  ];

  var BY_ID = {};
  DRILLS.forEach(function (x) { BY_ID[x.id] = x; });

  var KEEP_LOG_DAYS = 120;
  var REPEAT_GAP_DAYS = 10;   // a drill you finished isn't offered again for this long
  var HIDE_DAYS = 14;         // "not today" hides a drill this long
  var BIAS_MIN = -3, BIAS_MAX = 5;

  // ── dates (calendar days as written, never via UTC) ──
  function parseDay(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return null;
    var dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return isNaN(dt.getTime()) || dt.getMonth() !== Number(m[2]) - 1 ? null : dt;
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtDay(dt) { return dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate()); }
  function addDays(s, n) {
    var dt = parseDay(s);
    if (!dt) return s;
    dt.setDate(dt.getDate() + n);
    return fmtDay(dt);
  }
  function daysBetween(a, b) {   // b - a, in days
    var x = parseDay(a), y = parseDay(b);
    return x && y ? Math.round((y.getTime() - x.getTime()) / 86400000) : NaN;
  }
  var WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function dayLabel(s) {   // "Tue 29 Sep"
    var dt = parseDay(s);
    return dt ? WEEKDAY_SHORT[dt.getDay()] + " " + dt.getDate() + " " + MONTH_SHORT[dt.getMonth()] : "";
  }

  // ── saved state ──
  function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
  function normalizeState(raw) {
    var s = isObj(raw) ? raw : {};
    var out = { log: {}, skips: {}, bias: {}, hidden: {}, saved: [], tucked: "", mood: "surprise", level: "light" };
    if (isObj(s.log)) Object.keys(s.log).forEach(function (k) {
      var e = s.log[k];
      if (parseDay(k) && isObj(e) && BY_ID[e.id]) {
        var deep = e.level === "deep";
        out.log[k] = { id: e.id, level: deep ? "deep" : "light", deep: deep || e.deep === true };
      }
    });
    if (isObj(s.skips)) Object.keys(s.skips).forEach(function (k) {
      var n = Math.floor(Number(s.skips[k]));
      if (parseDay(k) && n > 0 && n < 1000) out.skips[k] = n;
    });
    if (isObj(s.bias)) Object.keys(s.bias).forEach(function (k) {
      var n = Number(s.bias[k]);
      if (CATEGORIES[k] && isFinite(n)) out.bias[k] = Math.max(BIAS_MIN, Math.min(BIAS_MAX, n));
    });
    if (isObj(s.hidden)) Object.keys(s.hidden).forEach(function (k) {
      if (BY_ID[k] && parseDay(s.hidden[k])) out.hidden[k] = s.hidden[k];
    });
    if (Array.isArray(s.saved)) s.saved.forEach(function (id) {
      if (BY_ID[id] && out.saved.indexOf(id) < 0) out.saved.push(id);
    });
    if (parseDay(s.tucked)) out.tucked = s.tucked;
    if (MOODS.some(function (m) { return m.key === s.mood; })) out.mood = s.mood;
    if (s.level === "deep") out.level = "deep";
    if (Array.isArray(s.practice)) out.practice = s.practice.filter(function(p) {
      return isObj(p) && typeof p.id === 'string' && /^[\w:-]+$/.test(p.id) && typeof p.title === 'string' && typeof p.prompt === 'string';
    }).map(function(p) {
      return {id:p.id,title:p.title,prompt:p.prompt,sourceHandId:isFinite(Number(p.sourceHandId)) ? Number(p.sourceHandId)||null : null,sourceTag:p.sourceTag || '',createdAt:Number(p.createdAt)||0,
        days:Array.from(new Set((Array.isArray(p.days)?p.days:[]).filter(function(d){return !!parseDay(d);}))).sort()};
    });
    return out;
  }

  // Keep the stored state small: the last 120 days of history only.
  function prune(state, today) {
    var s = normalizeState(state);
    [s.log, s.skips].forEach(function (map) {
      Object.keys(map).forEach(function (k) { if (daysBetween(k, today) > KEEP_LOG_DAYS) delete map[k]; });
    });
    Object.keys(s.hidden).forEach(function (k) { if (daysBetween(s.hidden[k], today) > 0) delete s.hidden[k]; });
    return s;
  }

  // ── choosing ──
  function hash01(str) {   // FNV-1a → [0, 1)
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }
  function moodCats(mood) {
    for (var i = 0; i < MOODS.length; i++) if (MOODS[i].key === mood) return MOODS[i].cats;
    return null;
  }

  // ctx: { eventSoon, recentLoss, noHands, lowShots } — booleans from the app.
  function weightOf(drill, ctx, state) {
    var w = 1, c = ctx || {};
    if (drill.cat === "prep") w *= c.eventSoon ? 3.2 : 0.25;
    if (drill.cat === "live") w *= c.eventSoon ? 1.6 : 0.6;
    if (drill.cat === "mental") w *= (c.recentLoss ? 2.2 : 1) * (c.eventSoon ? 1.3 : 1);
    if (drill.cat === "review") w *= (c.recentLoss ? 1.6 : 1) * (c.noHands ? 1.8 : 1);
    if (drill.cat === "bankroll") w *= c.lowShots ? 2.8 : 1;
    var bias = (state && state.bias && state.bias[drill.cat]) || 0;
    return w * Math.max(0.4, Math.min(2.5, 1 + 0.3 * bias));
  }

  // The order drills are offered in today: filtered by mood, minus recent and hidden
  // ones, then shuffled by a per-day hash weighted by the app's context. The same
  // inputs always give the same order, so the card doesn't change on a refresh.
  function ranked(opts) {
    var o = opts || {}, today = o.today, state = normalizeState(o.state);
    var cats = moodCats(o.mood || state.mood);
    var recent = {};
    Object.keys(state.log).forEach(function (k) {
      var ago = daysBetween(k, today);
      if (ago > 0 && ago <= REPEAT_GAP_DAYS) recent[state.log[k].id] = true;   // today's own pick stays put
    });
    function pool(strict) {
      return DRILLS.filter(function (x) {
        if (cats && cats.indexOf(x.cat) < 0) return false;
        if (strict && recent[x.id]) return false;
        if (strict && state.hidden[x.id] && daysBetween(today, state.hidden[x.id]) >= 0) return false;
        return true;
      });
    }
    var list = pool(true);
    if (list.length < 3) list = pool(false);   // a narrow mood shouldn't run dry
    return list.map(function (x) {
      return { drill: x, score: weightOf(x, o.ctx, state) * (0.5 + hash01(today + "|" + x.id)) };
    }).sort(function (a, b) { return b.score - a.score || (a.drill.id < b.drill.id ? -1 : 1); })
      .map(function (r) { return r.drill; });
  }

  function reasonFor(drill, ctx, mood) {
    var c = ctx || {};
    if (mood && mood !== "surprise") {
      for (var i = 0; i < MOODS.length; i++) if (MOODS[i].key === mood) return "You asked for: " + MOODS[i].label.toLowerCase();
    }
    if (drill.cat === "prep" && c.eventSoon) return "Because you're playing soon";
    if (drill.cat === "mental" && c.recentLoss) return "Because your last session was a rough one";
    if (drill.cat === "review" && c.noHands) return "Because you haven't logged a hand yet";
    if (drill.cat === "review" && c.recentLoss) return "Because your last session is worth a look";
    if (drill.cat === "bankroll" && c.lowShots) return "Because your bankroll is short on shots";
    return "From today's rotation";
  }

  // Today's drill: {drill, index, total, reason}. `skips` moves along the ranked
  // list ("try another"); the list wraps around.
  function pick(opts) {
    var o = opts || {}, state = normalizeState(o.state);
    var list = ranked({ today: o.today, ctx: o.ctx, state: state, mood: o.mood || state.mood });
    if (!list.length) return null;
    var idx = (state.skips[o.today] || 0) % list.length;
    var drill = list[idx];
    return { drill: drill, index: idx, total: list.length, reason: reasonFor(drill, o.ctx, o.mood || state.mood) };
  }

  // A saved drill can be revisited: returns the drill, or null when it isn't saved.
  function byId(id) { return BY_ID[id] || null; }

  // ── recording things ──
  function markDone(state, today, drillId, level) {
    var s = normalizeState(state);
    if (BY_ID[drillId]) {
      // A day is "deep" if any drill done that day was the 10-minute version, even
      // if a quicker one was logged after it.
      var deep = level === "deep" || !!(s.log[today] && s.log[today].deep);
      s.log[today] = { id: drillId, level: level === "deep" ? "deep" : "light", deep: deep };
    }
    return prune(s, today);
  }
  function undoDone(state, today) {
    var s = normalizeState(state);
    delete s.log[today];
    return s;
  }
  function skip(state, today) {
    var s = normalizeState(state);
    s.skips[today] = (s.skips[today] || 0) + 1;
    return s;
  }
  function bump(s, cat, by) {
    if (CATEGORIES[cat]) s.bias[cat] = Math.max(BIAS_MIN, Math.min(BIAS_MAX, (s.bias[cat] || 0) + by));
  }
  // kind: helpful | more | notToday
  function feedback(state, today, drillId, kind) {
    var s = normalizeState(state), x = BY_ID[drillId];
    if (!x) return s;
    if (kind === "helpful") bump(s, x.cat, 1);
    else if (kind === "more") bump(s, x.cat, 2);
    else if (kind === "notToday") {
      bump(s, x.cat, -0.5);
      s.hidden[drillId] = addDays(today, HIDE_DAYS);
    }
    return s;
  }
  function toggleSaved(state, drillId) {
    var s = normalizeState(state);
    if (!BY_ID[drillId]) return s;
    var i = s.saved.indexOf(drillId);
    if (i >= 0) s.saved.splice(i, 1); else s.saved.push(drillId);
    return s;
  }

  // ── the week ──
  // Monday → Sunday of the week containing `today`, each with whether a drill was done.
  function weekDays(state, today) {
    var s = normalizeState(state), dt = parseDay(today);
    if (!dt) return [];
    var monday = addDays(today, -((dt.getDay() + 6) % 7)), out = [];
    for (var i = 0; i < 7; i++) {
      var day = addDays(monday, i);
      out.push({ date: day, label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i], done: !!s.log[day], deep: !!(s.log[day] && s.log[day].deep), isToday: day === today, future: daysBetween(today, day) > 0 });
    }
    return out;
  }
  // Days in a row ending today (or yesterday, if today isn't done yet).
  function streak(state, today) {
    var s = normalizeState(state), day = s.log[today] ? today : addDays(today, -1), n = 0;
    while (s.log[day]) { n++; day = addDays(day, -1); }
    return n;
  }
  // Weeks (Monday to Sunday) in a row with at least one deep (10-minute) drill. This
  // week counts once it has one; until then the run carries on from last week.
  function deepWeeks(state, today) {
    var s = normalizeState(state), dt = parseDay(today);
    if (!dt) return 0;
    function weekHasDeep(monday) {
      for (var i = 0; i < 7; i++) { var e = s.log[addDays(monday, i)]; if (e && e.deep) return true; }
      return false;
    }
    var week = addDays(today, -((dt.getDay() + 6) % 7)), n = 0;
    if (!weekHasDeep(week)) week = addDays(week, -7);
    while (weekHasDeep(week) && n < 60) { n++; week = addDays(week, -7); }
    return n;
  }
  function weekMessage(state, today) {
    var days = weekDays(state, today);
    var done = days.filter(function (x) { return x.done; }).length;
    var deep = days.filter(function (x) { return x.deep; }).length;
    var run = streak(state, today), doneToday = !!normalizeState(state).log[today];
    var deepRun = deepWeeks(state, today);
    var msg;
    if (doneToday && run >= 3) msg = run + " days running. Keep the run going.";
    else if (!doneToday && run >= 2) msg = run + "-day run so far. Today keeps it alive.";
    else if (done === 0) return "A fresh week. Any day can be the first.";
    else msg = done + (done === 1 ? " drill" : " drills") + " this week" + (deep ? ", " + deep + " deep" : "") + ". Nice.";
    if (deepRun >= 2) msg += " Deep weeks in a row: " + deepRun + ".";
    else if (deep === 0 && done >= 2) msg += " Try a 10-minute one this week.";
    return msg;
  }

  var api = {
    CATEGORIES: CATEGORIES,
    MOODS: MOODS,
    ACTIONS: ACTIONS,
    DRILLS: DRILLS,
    REPEAT_GAP_DAYS: REPEAT_GAP_DAYS,
    HIDE_DAYS: HIDE_DAYS,
    normalizeState: normalizeState,
    prune: prune,
    ranked: ranked,
    pick: pick,
    byId: byId,
    markDone: markDone,
    undoDone: undoDone,
    skip: skip,
    feedback: feedback,
    toggleSaved: toggleSaved,
    weekDays: weekDays,
    streak: streak,
    deepWeeks: deepWeeks,
    weekMessage: weekMessage,
    reasonFor: reasonFor,
    dayLabel: dayLabel,
    addDays: addDays,
    daysBetween: daysBetween
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQDrills = api;
})(typeof window !== "undefined" ? window : undefined);
