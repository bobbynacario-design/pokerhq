var _editingTourneyId = null;
var MONTH_LONG_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var MONTH_SHORT_UPPER = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

function setTourneyModalTitle(text) {
  var el = document.querySelector('#modal-tourney .modal-title');
  if (el) el.textContent = text;
}

function toDateInputValue(d) {
  if (!d || isNaN(d.getTime())) return '';
  var m = String(d.getMonth() + 1);
  var day = String(d.getDate());
  return d.getFullYear() + '-' + (m.length < 2 ? '0' + m : m) + '-' + (day.length < 2 ? '0' + day : day);
}

function tourneyStartDateInputValue(tourney) {
  var range = parseTourneyDateRange(tourney);
  if (range && range.start) return toDateInputValue(range.start);
  // Fall back to a literal yyyy-mm-dd date string from manual entry
  if (/^\d{4}-\d{2}-\d{2}$/.test(tourney.date || '')) return tourney.date;
  return '';
}

function openNewTourneyModal() {
  _editingTourneyId = null;
  setTourneyModalTitle('Add Tournament');
  ['t-date', 't-name', 't-venue', 't-buyin', 't-gtd', 't-notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  openModal('modal-tourney');
}

function editTourney(id) {
  var tourney = tourneys.find(function(x) { return x.id === id; });
  if (!tourney) return;
  document.getElementById('t-date').value = tourneyStartDateInputValue(tourney);
  document.getElementById('t-name').value = tourney.name || '';
  document.getElementById('t-venue').value = tourney.venue || '';
  document.getElementById('t-buyin').value = tourney.buyin || '';
  document.getElementById('t-gtd').value = tourney.gtd || '';
  var structureEl = document.getElementById('t-structure');
  if (structureEl && tourney.structure) structureEl.value = tourney.structure;
  document.getElementById('t-notes').value = tourney.notes || '';
  _editingTourneyId = id;
  setTourneyModalTitle('Edit Tournament');
  openModal('modal-tourney');
}

function addTourney() {
  var br = bankroll.amount, rule = bankroll.rule || 15;
  var rec = br / rule, stretch = br / (rule * 0.6);
  var buyin = parseFloat(document.getElementById('t-buyin').value) || 0;
  var status = buyin <= rec ? 'target' : buyin <= stretch ? 'stretch' : 'skip';
  if (_editingTourneyId) {
    var existing = tourneys.find(function(x) { return x.id === _editingTourneyId; });
    if (!existing) { _editingTourneyId = null; return; }
    var inputDate = document.getElementById('t-date').value;
    var originalStart = tourneyStartDateInputValue(existing);
    if (inputDate && inputDate !== originalStart) {
      // Date actually changed: store a readable single date and refresh list-view fields
      var parts = inputDate.split('-');
      var newDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      existing.date = MONTH_LONG_NAMES[newDate.getMonth()] + ' ' + newDate.getDate() + ', ' + newDate.getFullYear();
      existing.day = String(newDate.getDate());
      existing.month = MONTH_SHORT_UPPER[newDate.getMonth()];
    }
    existing.name = document.getElementById('t-name').value || 'Tournament';
    existing.venue = document.getElementById('t-venue').value || '';
    existing.buyin = buyin;
    existing.gtd = document.getElementById('t-gtd').value || '';
    existing.structure = document.getElementById('t-structure').value;
    existing.notes = document.getElementById('t-notes').value || '';
    existing.status = status;
    window.tourneys = tourneys;
    tourneys.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    save('tourneys', tourneys);
    _editingTourneyId = null;
    setTourneyModalTitle('Add Tournament');
    closeModal('modal-tourney');
    renderCalendar();
    return;
  }

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

function getReminderSettings() {
  var r = window.reminderSettings || {};
  return {
    enabled: r.enabled === true,
    leadDays: Math.max(0, Math.min(14, parseInt(r.leadDays, 10) || 1)),
    email: r.email || window.__pokerhqAuthEmail || ''
  };
}

function renderReminderSettings() {
  var card = document.getElementById('reminder-settings-card');
  if (!card) return;
  var s = getReminderSettings();
  var toggle = document.getElementById('reminder-enabled');
  var lead = document.getElementById('reminder-lead');
  var emailEl = document.getElementById('reminder-email');
  if (toggle) toggle.checked = s.enabled;
  if (lead) lead.value = s.leadDays;
  if (emailEl) emailEl.textContent = s.email || 'sign in to set';
}

function saveReminderSettings() {
  var toggle = document.getElementById('reminder-enabled');
  var lead = document.getElementById('reminder-lead');
  var settings = {
    enabled: !!(toggle && toggle.checked),
    leadDays: Math.max(0, Math.min(14, parseInt(lead && lead.value, 10) || 1)),
    email: window.__pokerhqAuthEmail || (window.reminderSettings && window.reminderSettings.email) || ''
  };
  window.reminderSettings = settings;
  if (typeof save === 'function') save('reminderSettings', settings);
  var note = document.getElementById('reminder-saved-note');
  if (note) {
    note.textContent = settings.enabled
      ? '✓ Saved — you\'ll be emailed ' + settings.leadDays + ' day' + (settings.leadDays !== 1 ? 's' : '') + ' before target events.'
      : '✓ Saved — email reminders are off.';
    note.style.display = 'block';
  }
  renderReminderSettings();
}

function icsEscape(value) {
  return String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(d) {
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}

function icsStamp() {
  var d = new Date();
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate()) + 'T' +
    p(d.getUTCHours()) + p(d.getUTCMinutes()) + p(d.getUTCSeconds()) + 'Z';
}

function exportCalendarICS() {
  var todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  var upcoming = (window.tourneys || []).filter(function(t) {
    if (t.status === 'skip') return false; // only playable (target/stretch) events
    var range = parseTourneyDateRange(t);
    return range && range.end >= todayStart;
  });
  if (!upcoming.length) {
    if (typeof showUndoToast === 'function') {} // no-op
    alert('No upcoming target or stretch events to export. Add tournaments graded TARGET/STRETCH first.');
    return;
  }
  var stamp = icsStamp();
  var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PokerHQ//Tournament Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  upcoming.forEach(function(t) {
    var range = parseTourneyDateRange(t);
    var start = range.start;
    var endExclusive = new Date(range.end.getTime() + 24 * 60 * 60 * 1000); // DTEND is exclusive for all-day
    var statusLabel = { target: 'TARGET', stretch: 'STRETCH' }[t.status] || '';
    var descParts = [];
    if (t.buyin) descParts.push('Buy-in ₱' + Number(t.buyin).toLocaleString());
    if (t.gtd) descParts.push('GTD ' + t.gtd);
    if (t.structure) descParts.push(t.structure);
    if (statusLabel) descParts.push(statusLabel);
    descParts.push('via PokerHQ');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:pokerhq-' + (t.id || Math.random().toString(36).slice(2)) + '@pokerhq');
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART;VALUE=DATE:' + icsDate(start));
    lines.push('DTEND;VALUE=DATE:' + icsDate(endExclusive));
    lines.push('SUMMARY:' + icsEscape((t.buyin ? '♠ ' : '') + (t.name || 'Tournament') + (t.buyin ? ' (₱' + Number(t.buyin).toLocaleString() + ')' : '')));
    if (t.venue) lines.push('LOCATION:' + icsEscape(t.venue));
    lines.push('DESCRIPTION:' + icsEscape(descParts.join(' · ')));
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:' + icsEscape((t.name || 'Tournament') + ' starts tomorrow'));
    lines.push('TRIGGER:-P1D');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');

  var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'PokerHQ_Targets_' + new Date().toISOString().split('T')[0] + '.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function deleteTourney(id) {
  var idx = tourneys.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removed = tourneys[idx];
  tourneys = tourneys.filter(function(x) { return x.id !== id; });
  window.tourneys = tourneys;
  save('tourneys', tourneys);
  renderCalendar();
  if (typeof showUndoToast === 'function') showUndoToast('Tournament deleted: ' + (removed.name || ''), function() {
    tourneys.splice(Math.min(idx, tourneys.length), 0, removed);
    window.tourneys = tourneys;
    save('tourneys', tourneys);
    renderCalendar();
  });
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

// Open the calendar's list view, scroll to a specific event, and flash it.
// Used by the HOME "Today" glance to jump straight to the next event.
function jumpToCalendarEvent(id) {
  if (typeof switchGroup === 'function') switchGroup('plan', 'calendar');
  if (typeof setView === 'function') setView('list');
  setTimeout(function () {
    var row = document.getElementById('event-row-' + id);
    if (!row) return;
    if (row.scrollIntoView) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    row.classList.add('event-row-flash');
    setTimeout(function () { row.classList.remove('event-row-flash'); }, 1800);
  }, 80);
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
      html += '<div class="cal-event-bar ' + sc + ' ' + pos + ' ' + typeBar + '" title="' + esc(r.t.name) + ' (' + esc(r.t.series) + ') — ₱' + r.t.buyin.toLocaleString() + '">' + esc(name) + '</div>';
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
    html += '<span class="series-name">' + esc(key) + '</span>';
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

      html += '<div class="' + rowCls + '" id="event-row-' + t.id + '">';
      html += '<div class="event-date-box"><div class="event-date-day">' + esc(day) + '</div><div class="event-date-mon">' + esc(mon) + '</div></div>';
      html += '<div class="event-info">';
      html += '<div class="event-name">' + esc(t.name) + '</div>';
      html += '<div class="event-meta">';
      html += '<span>' + esc(t.structure) + '</span>';
      if (t.gtd) html += '<span>GTD: ' + esc(t.gtd) + '</span>';
      if (t.notes) html += '<span>' + esc(t.notes) + '</span>';
      html += '</div></div>';
      html += '<div class="event-right">';
      html += '<div class="event-buyin">₱' + t.buyin.toLocaleString() + '</div>';
      html += '<span class="' + badgeCls + '">' + badgeTxt + '</span>';
      html += '<span class="tourney-status ' + sc + '">' + sl + '</span>';
      html += '<button class="sec-action" style="font-size:10px;padding:3px 9px;margin-top:2px;border-color:var(--green);color:var(--green)" onclick="startSessionFromTourney(' + t.id + ')">▶ START SESSION</button>';
      html += '<button class="del-btn" title="Edit tournament" onclick="editTourney(' + t.id + ')">✎</button>';
      html += '<button class="del-btn" onclick="deleteTourney(' + t.id + ')">✕</button>';
      html += '</div></div>';
    });

    html += '</div></div>';
  });

  el.innerHTML = html;
}
