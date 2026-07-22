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
  // Start time as "HH:MM": the structured field when set (manual entry / future
  // imports), otherwise pulled from a "HH:MM start" phrase in the notes — briefing
  // imports embed the time there rather than in a dedicated time field.
  function eventTime(e) {
    if (e && e.time) return e.time;
    var m = /(\d{1,2}:\d{2})\s*start/i.exec((e && e.notes) || '');
    return m ? m[1] : '';
  }
  // Start time → minutes since midnight, or null when there's none.
  function timeMins(e) {
    var m = /^(\d{1,2}):(\d{2})/.exec(eventTime(e));
    return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null;
  }

  // "Starts in Xh Ym" against wall-clock now, only for an event whose focus
  // day is today and whose start time hasn't already passed — never shows a
  // stale or negative countdown.
  function countdownLabel(e, focusDate) {
    var mins = timeMins(e);
    if (mins == null) return null;
    var target = new Date(focusDate);
    target.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    var diffMs = target.getTime() - Date.now();
    if (diffMs <= 0) return null;
    var totalMin = Math.round(diffMs / 60000);
    var h = Math.floor(totalMin / 60), m = totalMin % 60;
    return h > 0 ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  // The next relevant day and EVERY event on it: today if anything runs today,
  // otherwise the next calendar day that has events. Multi-day events that span
  // the focus day are included. Returns null when nothing is upcoming, so a busy
  // festival day shows its whole slate instead of just the earliest event.
  function dayEvents() {
    var now = midnight(new Date());
    var rows = (window.tourneys || []).map(function (e) {
      if (!e) return null;
      var r = eventRange(e);
      return r ? { e: e, start: midnight(r.start), end: midnight(r.end) } : null;
    }).filter(Boolean).filter(function (x) {
      return x.end >= now; // upcoming, or a multi-day event still in progress
    });
    if (!rows.length) return null;
    var coversToday = rows.some(function (x) { return x.start <= now && x.end >= now; });
    var focus = coversToday ? now : rows.reduce(function (min, x) {
      return (min === null || x.start < min) ? x.start : min;
    }, null);
    var list = rows.filter(function (x) { return x.start <= focus && x.end >= focus; })
      .map(function (x) { return x.e; });
    return { focus: focus, list: list };
  }

  // Day-relative label from a focus date (today / tomorrow / in N days).
  function dayLabel(focus) {
    var now = midnight(new Date());
    var days = Math.round((focus - now) / 86400000);
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

  // The soonest event flagged "planning to play" on the calendar, independent of
  // the day's auto-surfaced slate. Reuses the calendar helper when loaded.
  function nextPlanned() {
    if (typeof window.getUpcomingPlannedTourneys !== 'function') return null;
    var arr = window.getUpcomingPlannedTourneys();
    return arr.length ? arr[0].t : null;
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
    var rule = (window.bankroll && window.bankroll.rule) || 5;
    var rec = rule ? br / rule : 0;
    var stretch = rule ? br / (rule * 0.6) : 0;
    var shots = rec > 0 ? Math.floor(br / rec) : 0;

    var day = dayEvents();
    var events = day ? day.list : [];
    var timer = timerInfo();

    // Grade every event live against the current bankroll (shared with calendar.js),
    // so the home read always matches the active BRM rule.
    function gradeOf(e) {
      return (typeof gradeBuyin === 'function') ? gradeBuyin(e.buyin) : (e.status || 'skip');
    }
    function gradeRank(g) { return g === 'target' ? 0 : g === 'stretch' ? 1 : 2; }
    // Playable (target, then stretch) first; within a grade, earliest start time
    // first (timed events ahead of untimed), then bigger buy-in.
    events.sort(function (a, b) {
      var d = gradeRank(gradeOf(a)) - gradeRank(gradeOf(b));
      if (d !== 0) return d;
      var ta = timeMins(a), tb = timeMins(b);
      if (ta !== null && tb !== null && ta !== tb) return ta - tb;
      if (ta !== null && tb === null) return -1;
      if (ta === null && tb !== null) return 1;
      return (parseFloat(b.buyin) || 0) - (parseFloat(a.buyin) || 0);
    });
    var bestRank = events.reduce(function (acc, e) {
      var r = gradeRank(gradeOf(e)); return r < acc ? r : acc;
    }, 3);
    var bestGrade = ['target', 'stretch', 'skip'][bestRank] || null;

    var label, cls, sub;
    if (timer.open) {
      label = timer.running ? 'PLAYING' : 'SESSION OPEN';
      cls = 'tg-playing';
      var nm = (window.getActiveSessionLabel && window.getActiveSessionLabel()) || 'Active session';
      sub = nm + (timer.running ? ' · ' + fmtElapsed(timer.elapsedMs) : ' · timer paused');
    } else if (!br) {
      label = 'SET BANKROLL'; cls = 'tg-skip';
      sub = 'Add a Treasury deposit so buy-ins can be graded.';
    } else if (events.length) {
      label = bestGrade === 'target' ? 'GO' : bestGrade === 'stretch' ? 'STRETCH' : 'SKIP';
      cls = bestGrade === 'target' ? 'tg-target' : bestGrade === 'stretch' ? 'tg-stretch' : 'tg-skip';
      var wl = dayLabel(day.focus);
      var base;
      if (events.length === 1) {
        base = events[0].name + ' · ' + money(events[0].buyin) + (eventTime(events[0]) ? ' · ' + eventTime(events[0]) : '');
      } else {
        var targetCount = events.filter(function (e) { return gradeOf(e) === 'target'; }).length;
        var stretchCount = events.filter(function (e) { return gradeOf(e) === 'stretch'; }).length;
        var skipCount = events.length - targetCount - stretchCount;
        var breakdown = [
          targetCount ? targetCount + ' target' : null,
          stretchCount ? stretchCount + ' stretch' : null,
          skipCount ? skipCount + ' skip' : null
        ].filter(Boolean).join(' · ');
        base = events.length + ' events' + (breakdown ? ' · ' + breakdown : '');
      }
      var countdown = (wl === 'today') ? countdownLabel(events[0], day.focus) : null;
      sub = base + (wl ? ' · ' + wl : '') + (countdown ? ' · starts in ' + countdown : '');
    } else {
      label = 'NO EVENTS'; cls = 'tg-idle';
      sub = 'Add a tournament to your calendar to get a read.';
    }

    // Tapping the verdict jumps to the top-ranked event's calendar row.
    var jumpHandler = events.length ? ' onclick="jumpToCalendarEvent(' + events[0].id + ')"' : '';
    var eventBased = events.length && (cls === 'tg-target' || cls === 'tg-stretch' || cls === 'tg-skip');

    // The day's full slate — each row graded live and tappable to its calendar row.
    var MAX_ROWS = 6;
    var shown = events.slice(0, MAX_ROWS);
    var moreCount = events.length - shown.length;
    var listHtml = shown.map(function (e) {
      var g = gradeOf(e);
      var gl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[g] || 'SKIP';
      var et = eventTime(e);
      return '<div class="tg-event tg-tappable" onclick="jumpToCalendarEvent(' + e.id + ')">' +
        '<span class="tg-grade tg-grade-' + g + '">' + gl + '</span>' +
        '<span class="tg-event-name">' + escape(e.name) + '</span>' +
        (et ? '<span class="tg-event-time">' + escape(et) + '</span>' : '') +
        '<span class="tg-event-buyin">' + money(e.buyin) + '</span>' +
      '</div>';
    }).join('');
    if (moreCount > 0) {
      listHtml += '<div class="tg-event-more tg-tappable" onclick="switchGroup(\'plan\',\'calendar\')">+' + moreCount + ' more · open calendar ↗</div>';
    }
    var dayHeading = events.length
      ? ((dayLabel(day.focus) === 'today' ? "Today's events" : 'Events ' + dayLabel(day.focus)) + ' · ' + events.length)
      : 'Next up';

    // Next pinned event — the user's own "I'm playing this" pick, shown above the
    // day's slate so it's the first thing read on HOME.
    var planned = nextPlanned();
    var plannedHtml = '';
    if (planned) {
      var pr = eventRange(planned);
      var plabel = pr ? dayLabel(midnight(pr.start)) : '';
      var pg = gradeOf(planned);
      var pgl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[pg] || 'SKIP';
      var pet = eventTime(planned);
      plannedHtml =
        '<div class="tg-planned tg-tappable" onclick="jumpToCalendarEvent(' + planned.id + ')">' +
          '<div class="tg-planned-label">★ Planning to play' + (plabel ? ' · ' + plabel : '') + '</div>' +
          '<div class="tg-planned-event">' +
            '<span class="tg-grade tg-grade-' + pg + '">' + pgl + '</span>' +
            '<span class="tg-planned-name">' + escape(planned.name) + '</span>' +
            (pet ? '<span class="tg-event-time">' + escape(pet) + '</span>' : '') +
            '<span class="tg-event-buyin">' + money(planned.buyin) + '</span>' +
          '</div>' +
        '</div>';
    }

    var primaryBtn = timer.open
      ? '<button class="tg-btn tg-btn-primary" onclick="switchGroup(\'play\',\'sessions\')">RESUME SESSION ↗</button>'
      : '<button class="tg-btn tg-btn-primary" onclick="switchGroup(\'plan\',\'calendar\')">' + (events.length ? 'OPEN CALENDAR ↗' : 'PLAN AN EVENT ↗') + '</button>';

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
          plannedHtml +
          '<div class="tg-next">' +
            '<div class="tg-next-label">' + dayHeading + (events.length ? '<span class="tg-jump-hint">view in calendar ↗</span>' : '') + '</div>' +
            (events.length ? '<div class="tg-event-list">' + listHtml + '</div>' : '<div class="tg-next-body">Nothing scheduled</div>') +
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

  // Otherwise still refresh once a minute so the "starts in" countdown
  // doesn't sit frozen at whatever it read on the last render.
  setInterval(function () {
    if (!window._timerInterval && document.getElementById('today-glance-wrap') && typeof window.renderTodayGlance === 'function') {
      window.renderTodayGlance();
    }
  }, 60000);
})();
