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

  function nextEvent() {
    var t = today();
    var list = (window.tourneys || []).filter(function (e) { return e && e.date && e.date >= t; });
    list.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    return list[0] || null;
  }

  function daysUntil(dateStr) {
    var d = new Date(dateStr + 'T00:00:00'), now = new Date(today() + 'T00:00:00');
    return Math.round((d - now) / 86400000);
  }
  function whenLabel(dateStr) {
    var d = daysUntil(dateStr);
    return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : 'in ' + d + ' days';
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

  window.renderTodayGlance = function () {
    var wrap = document.getElementById('today-glance-wrap');
    if (!wrap) return;

    var br = (window.bankroll && window.bankroll.amount) || 0;
    var rule = (window.bankroll && window.bankroll.rule) || 15;
    var rec = rule ? br / rule : 0;
    var stretch = rule ? br / (rule * 0.6) : 0;
    var shots = rec > 0 ? Math.floor(br / rec) : 0;

    var next = nextEvent();
    var timer = timerInfo();

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
      var g = next.status || 'skip';
      label = g === 'target' ? 'GO' : g === 'stretch' ? 'STRETCH' : 'SKIP';
      cls = g === 'target' ? 'tg-target' : g === 'stretch' ? 'tg-stretch' : 'tg-skip';
      sub = next.name + ' · ' + money(next.buyin) + ' · ' + whenLabel(next.date);
    } else {
      label = 'NO EVENTS'; cls = 'tg-idle';
      sub = 'Add a tournament to your calendar to get a read.';
    }

    var gradeChip = '';
    if (next) {
      var gl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[next.status || 'skip'] || 'SKIP';
      gradeChip = '<span class="tg-grade tg-grade-' + (next.status || 'skip') + '">' + gl + '</span>';
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
