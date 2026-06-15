// ── TODAY GLANCE ──
// One-screen "Go / No-Go" read for HOME: bankroll + BRM stake, the next
// playable event and its grade, and any live session — the pre-commitment
// decision surfaced without digging into the app. Reuses the same bankroll
// math as refreshDashboard() (rec = br/rule, stretch = br/(rule*0.6)) and the
// same TARGET/STRETCH/SKIP grading as calendar.js so it can never disagree
// with the rest of the dashboard.
(function () {
  function money(n) {
    if (typeof window.fmt === 'function') return '₱' + window.fmt(n || 0);
    return '₱' + Math.round(n || 0).toLocaleString();
  }
  function escape(s) {
    return typeof window.esc === 'function' ? window.esc(s == null ? '' : s) : ('' + (s == null ? '' : s));
  }
  function today() { return new Date().toISOString().split('T')[0]; }

  // Robust event date — reuse calendar.js's parser so every format the calendar
  // understands (ranges, "Month DD, YYYY", day+month fields) works here too.
  // Falls back to Date parsing only if the shared parser isn't available.
  function eventRange(t) {
    if (typeof parseTourneyDateRange === 'function') {
      var r = parseTourneyDateRange(t);
      if (r && r.start && !isNaN(r.start.getTime())) return r;
    }
    var d = t && t.date ? new Date(t.date) : null;
    return d && !isNaN(d.getTime()) ? { start: d, end: d } : null;
  }
  function midnight(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  function nextEvent() {
    var now = midnight(new Date());
    var rows = (window.tourneys || []).map(function (e) {
      if (!e) return null;
      var r = eventRange(e);
      return r ? { e: e, start: r.start, end: r.end } : null;
    }).filter(Boolean).filter(function (x) {
      return midnight(x.end) >= now; // upcoming, or a multi-day event still in progress
    });
    rows.sort(function (a, b) { return a.start - b.start; });
    return rows.length ? rows[0].e : null;
  }

  // Takes the tourney object (not a raw string) so it can use the shared parser.
  function whenLabel(t) {
    var r = eventRange(t);
    if (!r) return '';
    var now = midnight(new Date()), start = midnight(r.start), end = midnight(r.end);
    if (start <= now && end >= now) return 'today';
    var days = Math.round((start - now) / 86400000);
    return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days';
  }

  // active-session.js declares these as file-scope vars → globals on window.
  function timerInfo() {
    var running = !!window._timerInterval;
    var elapsedMs = running ? (Date.now() - (window._timerStart || Date.now())) : (window._timerElapsed || 0);
    return { running: running, elapsedMs: elapsedMs, open: !!window._activeSessionDraft || running || elapsedMs > 0 };
  }
  function fmtElapsed(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(Math.floor(s / 3600)) + ':' + p(Math.floor((s % 3600) / 60)) + ':' + p(s % 60);
  }

  function curr(n) { return typeof window.fmtCur === 'function' ? window.fmtCur(n) : money(n); }

  // Compact monthly-goal bar for the card. Mirrors goalBar() in bankroll-chart.js
  // (same pct/reached logic) but scaled down to fit the glance.
  function miniGoal(label, cur, target, dispCur, dispTarget, color) {
    var pct = target > 0 ? Math.max(0, Math.min(100, Math.round((cur / target) * 100))) : 0;
    var reached = target > 0 && cur >= target;
    return '<div class="tg-goal">' +
      '<div class="tg-goal-top"><span class="tg-goal-label">' + label + (reached ? ' ✓' : '') + '</span>' +
      '<span class="tg-goal-figs">' + dispCur + ' <span class="tg-goal-sep">/ ' + dispTarget + '</span></span></div>' +
      '<div class="tg-goal-track"><div class="tg-goal-fill" style="width:' + pct + '%;background:' + (reached ? 'var(--green)' : color) + '"></div></div>' +
      '</div>';
  }

  function goalsBlock() {
    if (typeof getMonthlyGoals !== 'function' || typeof getMonthlyProgress !== 'function') return '';
    var g = getMonthlyGoals(), p = getMonthlyProgress();
    if (!(g.profit || g.volume || g.study)) {
      return '<div class="tg-goals tg-goals-empty">' +
        '<span class="tg-goals-label">This month</span>' +
        '<button class="tg-btn tg-btn-mini" onclick="tgSetGoals()">SET GOALS</button></div>';
    }
    var rows = '';
    if (g.profit) rows += miniGoal('Profit', p.profit, g.profit, curr(p.profit), money(g.profit), 'var(--gold)');
    if (g.volume) rows += miniGoal('Tourneys', p.volume, g.volume, String(p.volume), String(g.volume), 'var(--blue)');
    if (g.study) rows += miniGoal('Study', p.study, g.study, String(p.study), String(g.study), 'var(--purple)');
    return '<div class="tg-goals"><div class="tg-goals-label">This month</div>' + rows + '</div>';
  }

  // Open the monthly-goals editor (lower on HOME) and scroll it into view.
  window.tgSetGoals = function () {
    if (typeof editMonthlyGoals === 'function') editMonthlyGoals();
    var m = document.getElementById('monthly-goals');
    if (m && m.scrollIntoView) m.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  window.renderTodayGlance = function () {
    var wrap = document.getElementById('today-glance-wrap');
    if (!wrap) return;

    var br = (window.bankroll && window.bankroll.amount) || 0;
    var rule = (window.bankroll && window.bankroll.rule) || 10;
    var rec = rule ? br / rule : 0;
    var stretch = rule ? br / (rule * 0.6) : 0;
    var shots = rec > 0 ? Math.floor(br / rec) : 0;

    var next = nextEvent();
    var timer = timerInfo();
    // Grade live against the current bankroll (shared with calendar.js).
    var nextGrade = next ? ((typeof gradeBuyin === 'function') ? gradeBuyin(next.buyin) : (next.status || 'skip')) : null;

    var label, cls, sub;
    if (timer.open) {
      label = timer.running ? 'PLAYING' : 'SESSION OPEN';
      cls = 'tg-playing';
      var nm = (window.getActiveSessionLabel && window.getActiveSessionLabel()) || 'Active session';
      sub = nm + (timer.running ? ' · ' + fmtElapsed(timer.elapsedMs) : ' · timer paused');
    } else if (!br) {
      label = 'SET BANKROLL'; cls = 'tg-skip';
      sub = 'Add a Treasury deposit so buy-ins can be graded.';
    } else if (next) {
      var g = nextGrade;
      label = g === 'target' ? 'GO' : g === 'stretch' ? 'STRETCH' : 'SKIP';
      cls = g === 'target' ? 'tg-target' : g === 'stretch' ? 'tg-stretch' : 'tg-skip';
      var wl = whenLabel(next);
      sub = next.name + ' · ' + money(next.buyin) + (wl ? ' · ' + wl : '');
    } else {
      label = 'NO EVENTS'; cls = 'tg-idle';
      sub = 'Add a tournament to your calendar to get a read.';
    }

    var gradeChip = '';
    if (next) {
      var gl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[nextGrade] || 'SKIP';
      gradeChip = '<span class="tg-grade tg-grade-' + nextGrade + '">' + gl + '</span>';
    }

    // Tapping the verdict or "next up" jumps to that event's calendar row.
    var jumpHandler = next ? ' onclick="jumpToCalendarEvent(' + next.id + ')"' : '';
    var eventBased = next && (cls === 'tg-target' || cls === 'tg-stretch' || cls === 'tg-skip');

    var primaryBtn = timer.open
      ? '<button class="tg-btn tg-btn-primary" onclick="switchGroup(\'play\',\'sessions\')">RESUME SESSION ↗</button>'
      : '<button class="tg-btn tg-btn-primary" onclick="switchGroup(\'plan\',\'calendar\')">' + (next ? 'OPEN CALENDAR ↗' : 'PLAN AN EVENT ↗') + '</button>';

    wrap.innerHTML =
      '<div class="tg-card">' +
        '<div class="tg-verdict ' + cls + (eventBased ? ' tg-tappable' : '') + '"' + (eventBased ? jumpHandler : '') + '>' +
          '<div class="tg-verdict-label">' + label + '</div>' +
          '<div class="tg-verdict-sub">' + escape(sub) + '</div>' +
        '</div>' +
        '<div class="tg-body">' +
          '<div class="tg-stats">' +
            '<div class="tg-stat"><span class="tg-stat-label">Bankroll</span><span class="tg-stat-val">' + money(br) + '</span></div>' +
            '<div class="tg-stat"><span class="tg-stat-label">Recommended</span><span class="tg-stat-val">' + money(rec) + '</span></div>' +
            '<div class="tg-stat"><span class="tg-stat-label">Stretch</span><span class="tg-stat-val">' + money(stretch) + '</span></div>' +
            '<div class="tg-stat"><span class="tg-stat-label">Shots</span><span class="tg-stat-val">' + (rec > 0 ? shots + 'x' : '—') + '</span></div>' +
          '</div>' +
          '<div class="tg-next' + (next ? ' tg-tappable' : '') + '"' + (next ? jumpHandler : '') + '>' +
            '<div class="tg-next-label">Next up ' + gradeChip + (next ? '<span class="tg-jump-hint">view in calendar ↗</span>' : '') + '</div>' +
            '<div class="tg-next-body">' + (next ? escape(next.name) + ' — ' + money(next.buyin) + (next.venue ? ' · ' + escape(next.venue) : '') : 'Nothing scheduled') + '</div>' +
          '</div>' +
          goalsBlock() +
          '<div class="tg-actions">' + primaryBtn +
            '<button class="tg-btn" onclick="startSessionFromHome()">MANUAL SESSION</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  };

  // While a session timer is running, keep the elapsed read live.
  setInterval(function () {
    if (window._timerInterval && document.getElementById('today-glance-wrap') && typeof window.renderTodayGlance === 'function') {
      window.renderTodayGlance();
    }
  }, 1000);
})();
