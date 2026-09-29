// ── DAILY DRILL ──
// The card in the left column of the HOME "Go" widget: one small, poker-specific
// thing to do today, in 2 minutes or in 10. Which drill comes up is picked by
// js/data/drills.js from what's happening in the app (a pinned event coming up, a
// rough last session, a thin bankroll, no hands logged). Progress lives on this
// device only (localStorage) — it's a habit nudge, not data worth syncing.
(function () {
  var KEY = 'pokerhq_drill_v1';
  var viewSaved = null;   // a saved drill being revisited instead of today's pick
  var note = '';          // one-line acknowledgement shown until the next action

  function lib() { return window.PokerHQDrills; }
  function escape(s) { return typeof window.esc === 'function' ? window.esc(s) : String(s == null ? '' : s); }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY)); } catch (e) { raw = null; }
    return lib().normalizeState(raw);
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode / full: keep working in memory */ }
  }
  function update(fn) {
    var s = fn(load());
    save(s);
    window.renderDailyDrill();
    note = '';
  }

  function fmtDay(dt) { return todayLocal(dt); }

  // What the app knows that should steer today's drill.
  function drillContext() {
    var L = lib(), today = todayLocal(), tomorrow = L.addDays(today, 1);
    var ctx = { eventSoon: false, recentLoss: false, noHands: false, lowShots: false };

    // A pinned (★ "planning to play") event today or tomorrow.
    (window.tourneys || []).forEach(function (t) {
      if (ctx.eventSoon || !t || !t.planning || typeof window.parseTourneyDateRange !== 'function') return;
      var r = window.parseTourneyDateRange(t);
      if (r && r.start && r.end && fmtDay(r.start) <= tomorrow && fmtDay(r.end) >= today) ctx.eventSoon = true;
    });

    var sessions = (window.sessions || []).filter(function (s) { return s && /^\d{4}-\d{2}-\d{2}/.test(s.date || ''); });
    sessions.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    if (sessions.length) {
      var last = sessions[0];
      if (L.daysBetween(String(last.date).slice(0, 10), today) <= 2 && (Number(last.pnl) || 0) < 0) ctx.recentLoss = true;
      // Runway: how many of your recent average buy-ins the bankroll covers.
      var recent = sessions.slice(0, 10).map(function (s) { return Number(s.total) || 0; }).filter(function (n) { return n > 0; });
      var br = (window.bankroll && Number(window.bankroll.amount)) || 0;
      if (recent.length >= 3) {
        var avg = recent.reduce(function (a, b) { return a + b; }, 0) / recent.length;
        if (avg > 0 && br / avg < 10) ctx.lowShots = true;
      }
    }
    ctx.noHands = !(window.hands || []).length;
    return ctx;
  }

  window.drillContext = drillContext;   // exposed for tests / debugging

  function current(state, today) {
    var L = lib();
    if (viewSaved) {
      var d = state.saved.indexOf(viewSaved) >= 0 ? L.byId(viewSaved) : null;
      if (d) return { drill: d, reason: 'From your saved drills', saved: true };
      viewSaved = null;
    }
    return L.pick({ today: today, ctx: drillContext(), state: state, mood: state.mood });
  }

  function btn(label, handler, cls, extra) {
    return '<button type="button" class="tg-btn ' + (cls || '') + '" onclick="' + handler + '"' + (extra || '') + '>' + label + '</button>';
  }
  function chip(label, handler, active) {
    return '<button type="button" class="tg-chip' + (active ? ' active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '" onclick="' + handler + '">' + label + '</button>';
  }

  window.renderDailyDrill = function () {
    var el = document.getElementById('tg-drill');
    var L = lib();
    if (!el || !L) return;
    var today = todayLocal(), state = load();

    if (state.tucked === today) {
      el.className = 'tg-drill tg-drill-tucked';
      el.innerHTML = '<span class="tg-drill-kicker">Today\'s drill · tucked away</span>' +
        btn('SHOW', 'drillTuck()', 'tg-btn-mini');
      return;
    }

    var cur = current(state, today);
    if (!cur || !cur.drill) { el.innerHTML = ''; return; }
    var x = cur.drill, level = state.level === 'deep' ? 'deep' : 'light';
    var doneToday = !!(state.log[today] && state.log[today].id === x.id);
    var isSaved = state.saved.indexOf(x.id) >= 0;

    var week = L.weekDays(state, today).map(function (w) {
      return '<span class="tg-dot' + (w.done ? ' done' : '') + (w.isToday ? ' today' : '') + (w.future ? ' future' : '') +
        '" title="' + escape(L.dayLabel(w.date) + (w.done ? ' · done' : '')) + '"></span>';
    }).join('');

    var moods = L.MOODS.map(function (m) {
      return '<option value="' + m.key + '"' + (m.key === state.mood ? ' selected' : '') + '>' + escape(m.label) + '</option>';
    }).join('');

    var actions = doneToday
      ? '<div class="tg-drill-done">✓ Done for today. Nice work.</div>' +
        '<div class="tg-drill-actions">' + btn('ANOTHER ONE ANYWAY', 'drillAnother()') + btn('UNDO', 'drillUndo()') + '</div>'
      : '<div class="tg-drill-actions">' + btn('I DID IT', 'drillDone()', 'tg-btn-primary') + btn(cur.saved ? 'BACK TO TODAY\'S' : 'TRY ANOTHER', cur.saved ? 'drillBack()' : 'drillAnother()') + '</div>';

    el.className = 'tg-drill';
    el.innerHTML =
      '<div class="tg-drill-top">' +
        '<span class="tg-drill-kicker">Today\'s drill · ' + escape(L.dayLabel(today)) + ' · ' + escape(L.CATEGORIES[x.cat]) + '</span>' +
        '<span class="tg-drill-top-btns">' +
          (state.saved.length && !cur.saved ? btn('SAVED · ' + state.saved.length, 'drillShowSaved()', 'tg-btn-mini') : '') +
          (cur.saved && state.saved.length > 1 ? btn('NEXT SAVED', 'drillShowSaved()', 'tg-btn-mini') : '') +
          btn(isSaved ? '★ SAVED' : '☆ SAVE', 'drillSave()', 'tg-btn-mini', ' aria-pressed="' + isSaved + '"') +
        '</span>' +
      '</div>' +
      '<div class="tg-drill-title">' + escape(x.title) + '</div>' +
      '<div class="tg-drill-why">' + escape(cur.reason) + '</div>' +
      '<div class="tg-drill-levels">' +
        chip('KEEP IT LIGHT · 2 MIN', "drillLevel('light')", level === 'light') +
        chip('GO DEEPER · 10 MIN', "drillLevel('deep')", level === 'deep') +
      '</div>' +
      '<div class="tg-drill-step">' + escape(x[level]) + '</div>' +
      (x.go ? '<div class="tg-drill-go">' + btn(escape(x.go.label) + ' ↗', "drillGo('" + x.go.action + "')") + '</div>' : '') +
      actions +
      '<div class="tg-drill-fb"><span>' + (note ? escape(note) : 'Did this help?') + '</span>' +
        chip('HELPFUL', "drillFeedback('helpful')", false) +
        chip('NOT TODAY', "drillFeedback('notToday')", false) +
        chip('MORE LIKE THIS', "drillFeedback('more')", false) +
      '</div>' +
      '<div class="tg-drill-week"><span class="tg-drill-week-label">This week</span><span class="tg-dots">' + week + '</span>' +
        '<span class="tg-drill-week-msg">' + escape(L.weekMessage(state, today)) + '</span></div>' +
      '<div class="tg-drill-foot">' +
        '<label class="tg-drill-mood">What do you need today? <select class="tg-drill-select" aria-label="What do you need today?" onchange="drillMood(this.value)">' + moods + '</select></label>' +
        '<span class="tg-drill-keys">Keys: N another · D done · T tuck away</span>' +
        btn('TUCK AWAY', 'drillTuck()', 'tg-btn-mini') +
      '</div>';
  };

  // ── actions ──
  window.drillLevel = function (level) {
    update(function (s) { s.level = level === 'deep' ? 'deep' : 'light'; return s; });
  };
  window.drillDone = function () {
    var today = todayLocal(), s = load(), cur = current(s, today);
    if (!cur || !cur.drill) return;
    update(function (st) { return lib().markDone(st, today, cur.drill.id, st.level); });
  };
  window.drillUndo = function () {
    var today = todayLocal();
    update(function (s) { return lib().undoDone(s, today); });
  };
  window.drillAnother = function () {
    var today = todayLocal();
    viewSaved = null;
    update(function (s) { return lib().skip(s, today); });
  };
  window.drillFeedback = function (kind) {
    var today = todayLocal(), s = load(), cur = current(s, today);
    if (!cur || !cur.drill) return;
    var id = cur.drill.id;
    note = kind === 'notToday' ? 'Got it. Skipping that one for a while.' : kind === 'more' ? 'Noted. More like this.' : 'Thanks. Noted.';
    update(function (st) {
      var next = lib().feedback(st, today, id, kind);
      // "not today" also moves on, so the drill you just dismissed stops being the card.
      if (kind === 'notToday') { viewSaved = null; next = lib().skip(next, today); }
      return next;
    });
  };
  window.drillSave = function () {
    var today = todayLocal(), s = load(), cur = current(s, today);
    if (!cur || !cur.drill) return;
    update(function (st) { return lib().toggleSaved(st, cur.drill.id); });
  };
  window.drillShowSaved = function () {
    var s = load();
    if (!s.saved.length) return;
    var i = viewSaved ? s.saved.indexOf(viewSaved) : -1;
    viewSaved = s.saved[(i + 1) % s.saved.length];
    window.renderDailyDrill();
  };
  window.drillBack = function () { viewSaved = null; window.renderDailyDrill(); };
  window.drillMood = function (mood) {
    viewSaved = null;
    update(function (s) { s.mood = mood; delete s.skips[todayLocal()]; return s; });
  };
  window.drillTuck = function () {
    var today = todayLocal();
    viewSaved = null;
    update(function (s) { s.tucked = s.tucked === today ? '' : today; return s; });
  };

  // The button on a drill: open the part of the app it's about.
  var GO = {
    advisor: function () { switchGroup('play', 'calculator'); calcSwitchMode('icm'); },
    icm: function () { switchGroup('play', 'calculator'); calcSwitchMode('icmcalc'); },
    payout: function () { switchGroup('play', 'calculator'); calcSwitchMode('payout'); },
    risk: function () { switchGroup('play', 'calculator'); calcSwitchMode('risk'); },
    hands: function () { switchGroup('play', 'hands'); },
    history: function () { switchGroup('review', 'sessions'); },
    heatmap: function () { switchGroup('review', 'heatmap'); },
    calendar: function () { switchGroup('plan', 'calendar'); },
    satellites: function () { switchGroup('plan', 'satellite'); },
    treasury: function () { switchGroup('wallet', 'wallet'); },
    strategy: function () { switchGroup('improve', 'strategy'); },
    opponents: function () { switchGroup('improve', 'opponents'); },
    play: function () { switchGroup('play', 'sessions'); },
    home: function () {
      var el = document.getElementById('dash-pnl');
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  window.drillGo = function (action) {
    if (GO[action]) GO[action]();
  };

  // N = another, D = done, T = tuck away — only on HOME, and never while typing.
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) || t.isContentEditable)) return;
    var page = document.getElementById('page-dashboard');
    if (!page || !page.classList.contains('active') || !document.getElementById('tg-drill')) return;
    if (document.querySelector('.modal-overlay.open')) return;
    var k = String(e.key || '').toLowerCase();
    if (k === 'n') window.drillAnother();
    else if (k === 'd') window.drillDone();
    else if (k === 't') window.drillTuck();
  });
})();
