function addTourney() {
  var br = bankroll.amount, rule = bankroll.rule || 15;
  var rec = br / rule, stretch = br / (rule * 0.6);
  var buyin = parseFloat(document.getElementById('t-buyin').value) || 0;
  var status = buyin <= rec ? 'target' : buyin <= stretch ? 'stretch' : 'skip';

  var t = {
    id: Date.now(),
    date: document.getElementById('t-date').value,
    name: document.getElementById('t-name').value || 'Tournament',
    venue: document.getElementById('t-venue').value || '',
    buyin: buyin,
    gtd: document.getElementById('t-gtd').value || '',
    structure: document.getElementById('t-structure').value,
    notes: document.getElementById('t-notes').value || '',
    status: status
  };
  window.tourneys.push(t);
  tourneys = window.tourneys;
  tourneys.sort(function(a, b) { return a.date.localeCompare(b.date); });
  save('tourneys', tourneys);
  closeModal('modal-tourney');
  renderCalendar();
}

function deleteTourney(id) {
  tourneys = tourneys.filter(function(x) { return x.id !== id; });
  save('tourneys', tourneys);
  renderCalendar();
}

function renderCalendar() {
  renderCalendarMonth();
  renderCalendarList();
}

var calView = 'month';
var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();

function setView(v) {
  calView = v;
  document.getElementById('cal-month-view').style.display = v === 'month' ? 'block' : 'none';
  document.getElementById('cal-list-view').style.display = v === 'list' ? 'block' : 'none';
  document.getElementById('vbtn-month').classList.toggle('active', v === 'month');
  document.getElementById('vbtn-list').classList.toggle('active', v === 'list');
}

function changeMonth(dir) {
  calMonth += dir;
  if (calMonth > 11) {
    calMonth = 0;
    calYear++;
  }
  if (calMonth < 0) {
    calMonth = 11;
    calYear--;
  }
  renderCalendarMonth();
}

function parseTourneyDateRange(t) {
  var dateStr = t.date || '';
  var MONTHS = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
    jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };
  var rangeMatch = dateStr.match(/(\w+)\s+(\d{1,2})\s*[-–]\s*(?:(\w+)\s+)?(\d{1,2}),?\s*(\d{4})/i);
  if (rangeMatch) {
    var startMon = MONTHS[rangeMatch[1].toLowerCase()];
    var startDay = parseInt(rangeMatch[2], 10);
    var endMon = rangeMatch[3] ? MONTHS[rangeMatch[3].toLowerCase()] : startMon;
    var endDay = parseInt(rangeMatch[4], 10);
    var yr = parseInt(rangeMatch[5], 10);
    if (startMon !== undefined && endMon !== undefined) {
      return { start: new Date(yr, startMon, startDay), end: new Date(yr, endMon, endDay) };
    }
  }
  var singleMatch = dateStr.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/i);
  if (singleMatch) {
    var mon = MONTHS[singleMatch[1].toLowerCase()];
    if (mon !== undefined) {
      var d = new Date(parseInt(singleMatch[3], 10), mon, parseInt(singleMatch[2], 10));
      return { start: d, end: d };
    }
  }
  if (t.day && t.month) {
    var MMAP = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
    var m = MMAP[t.month.toUpperCase()];
    if (m !== undefined) {
      var d2 = new Date(new Date().getFullYear(), m, parseInt(t.day, 10));
      return { start: d2, end: d2 };
    }
  }
  return null;
}

function renderCalendarMonth() {
  var titleEl = document.getElementById('cal-month-title');
  var gridEl = document.getElementById('cal-days-grid');
  if (!titleEl || !gridEl) return;

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  titleEl.textContent = monthNames[calMonth] + ' ' + calYear;

  var today = new Date();
  var firstDay = new Date(calYear, calMonth, 1).getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var daysInPrev = new Date(calYear, calMonth, 0).getDate();

  var tourneyRanges = tourneys.map(function(t) {
    var range = parseTourneyDateRange(t);
    return range ? { t: t, start: range.start, end: range.end } : null;
  }).filter(Boolean);

  var cells = [];
  for (var i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, month: calMonth - 1, year: calYear, other: true });
  }
  for (var d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, month: calMonth, year: calYear, other: false });
  }
  var remaining = 42 - cells.length;
  for (var n = 1; n <= remaining; n++) {
    cells.push({ day: n, month: calMonth + 1, year: calYear, other: true });
  }

  var html = '';
  cells.forEach(function(cell) {
    var cellDate = new Date(cell.year, cell.month, cell.day);
    var isToday = !cell.other && cell.day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    var cls = 'cal-day' + (cell.other ? ' other-month' : '') + (isToday ? ' today' : '');
    var events = tourneyRanges.filter(function(r) { return cellDate >= r.start && cellDate <= r.end; });

    html += '<div class="' + cls + '">';
    html += '<div class="cal-day-num">' + cell.day + '</div>';
    events.forEach(function(r) {
      var isStart = cellDate.getTime() === r.start.getTime();
      var isEnd = cellDate.getTime() === r.end.getTime();
      var isSolo = isStart && isEnd;
      var pos = isSolo ? 'solo' : isStart ? 'start' : isEnd ? 'end' : 'mid';
      var sc = r.t.status || 'skip';
      var typeBar = r.t.type === 'main' ? 'main-event-bar' : 'side-event-bar';
      var name = isStart || isSolo ? r.t.name.substring(0, 14) + (r.t.name.length > 14 ? '…' : '') : '';
      html += '<div class="cal-event-bar ' + sc + ' ' + pos + ' ' + typeBar + '" title="' + r.t.name + ' (' + r.t.series + ') — ₱' + r.t.buyin.toLocaleString() + '">' + name + '</div>';
    });
    html += '</div>';
  });

  gridEl.innerHTML = html;
}

function renderCalendarList() {
  var el = document.getElementById('calendar-list');
  if (!el) return;
  if (!tourneys.length) {
    el.innerHTML = '<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">No tournaments added. Click + ADD TOURNAMENT to start.</div>';
    return;
  }

  var seriesMap = {};
  var seriesOrder = [];
  tourneys.forEach(function(t) {
    var key = t.series || t.name;
    if (!seriesMap[key]) {
      seriesMap[key] = [];
      seriesOrder.push(key);
    }
    seriesMap[key].push(t);
  });

  var html = '';
  seriesOrder.forEach(function(key) {
    var events = seriesMap[key];
    var hasMain = events.some(function(e) { return e.type === 'main'; });
    var icon = hasMain ? '🏆' : '♠';
    var count = events.length;

    html += '<div class="series-group">';
    html += '<div class="series-header">';
    html += '<span class="series-icon">' + icon + '</span>';
    html += '<span class="series-name">' + key + '</span>';
    html += '<span class="series-count">' + count + ' EVENT' + (count > 1 ? 'S' : '') + '</span>';
    html += '</div>';
    html += '<div class="series-events">';

    events.forEach(function(t) {
      var day = t.day || '';
      var mon = t.month || '';
      if (!day || !mon) {
        var dm = (t.date || '').match(/(\w+)\s+(\d{1,2})/);
        if (dm) {
          var mmap = { january: 'JAN', february: 'FEB', march: 'MAR', april: 'APR', may: 'MAY', june: 'JUN', july: 'JUL', august: 'AUG', september: 'SEP', october: 'OCT', november: 'NOV', december: 'DEC' };
          mon = mmap[dm[1].toLowerCase()] || dm[1].substring(0, 3).toUpperCase();
          day = dm[2];
        }
      }
      if (!day) day = '?';
      if (!mon) mon = '?';

      var isMain = t.type === 'main';
      var rowCls = isMain ? 'event-row main-event' : 'event-row side-event';
      var badgeCls = isMain ? 'event-type-badge main' : 'event-type-badge side';
      var badgeTxt = isMain ? 'MAIN' : 'SIDE';
      var sc = { target: 'ts-target', stretch: 'ts-stretch', skip: 'ts-skip' }[t.status] || 'ts-skip';
      var sl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[t.status] || 'SKIP';

      html += '<div class="' + rowCls + '">';
      html += '<div class="event-date-box"><div class="event-date-day">' + day + '</div><div class="event-date-mon">' + mon + '</div></div>';
      html += '<div class="event-info">';
      html += '<div class="event-name">' + t.name + '</div>';
      html += '<div class="event-meta">';
      html += '<span>' + t.structure + '</span>';
      if (t.gtd) html += '<span>GTD: ' + t.gtd + '</span>';
      if (t.notes) html += '<span>' + t.notes + '</span>';
      html += '</div></div>';
      html += '<div class="event-right">';
      html += '<div class="event-buyin">₱' + t.buyin.toLocaleString() + '</div>';
      html += '<span class="' + badgeCls + '">' + badgeTxt + '</span>';
      html += '<span class="tourney-status ' + sc + '">' + sl + '</span>';
      html += '<button class="sec-action" style="font-size:10px;padding:3px 9px;margin-top:2px;border-color:var(--green);color:var(--green)" onclick="startSessionFromTourney(' + t.id + ')">▶ START SESSION</button>';
      html += '<button class="del-btn" onclick="deleteTourney(' + t.id + ')">✕</button>';
      html += '</div></div>';
    });

    html += '</div></div>';
  });

  el.innerHTML = html;
}
