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
  ['t-date', 't-time', 't-name', 't-venue', 't-buyin', 't-gtd', 't-notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  openModal('modal-tourney');
}

function editTourney(id) {
  var tourney = tourneys.find(function(x) { return x.id === id; });
  if (!tourney) return;
  document.getElementById('t-date').value = tourneyStartDateInputValue(tourney);
  document.getElementById('t-time').value = tourney.time || '';
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

// Grade a buy-in against the CURRENT bankroll/BRM rule — the single source of
// truth so every grade shown reflects the live bankroll, not a value frozen
// when the event was added.
function gradeBuyin(buyin) {
  var br = (window.bankroll && window.bankroll.amount) || 0;
  var rule = (window.bankroll && window.bankroll.rule) || 5;
  if (!br) return 'skip';
  var rec = br / rule, stretch = br / (rule * 0.6);
  var b = parseFloat(buyin) || 0;
  return b <= rec ? 'target' : b <= stretch ? 'stretch' : 'skip';
}

// ── PLANNED EVENTS — a personal shortlist of events you intend to play ──
// `planning` is a per-tourney boolean, toggled with the ★ button in the list.
// It is independent of the bankroll grade (TARGET/STRETCH/SKIP): the grade
// answers "can I afford it", planning answers "I've decided to play it". Drives
// the "Playing These" card on the calendar and the next-planned read on HOME.
function togglePlanning(id) {
  var t = (window.tourneys || []).find(function (x) { return x.id === id; });
  if (!t) return;
  t.planning = !t.planning;
  window.tourneys = tourneys;
  save('tourneys', tourneys);
  renderCalendar();
  if (typeof renderTodayGlance === 'function') renderTodayGlance();
}

// Planned events whose end date is today or later, soonest first. Shared by the
// shortlist card here and the HOME glance (via window).
function getUpcomingPlannedTourneys() {
  var todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return (window.tourneys || []).map(function (t) {
    if (!t || !t.planning) return null;
    var range = parseTourneyDateRange(t);
    return (range && range.end >= todayStart) ? { t: t, range: range } : null;
  }).filter(Boolean).sort(function (a, b) { return a.range.start - b.range.start; });
}
window.getUpcomingPlannedTourneys = getUpcomingPlannedTourneys;

function addTourney() {
  var buyin = parseFloat(document.getElementById('t-buyin').value) || 0;
  var status = gradeBuyin(buyin);
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
    existing.time = document.getElementById('t-time').value || '';
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
    time: document.getElementById('t-time').value || '',
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
    if (gradeBuyin(t.buyin) === 'skip') return false; // only playable (target/stretch) events
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
    var statusLabel = { target: 'TARGET', stretch: 'STRETCH' }[gradeBuyin(t.buyin)] || '';
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

function dedupeTourneys() {
  var list = window.tourneys || [];
  // Same identity key the weekly-briefing import uses: canonical date + name + venue.
  var keyOf = (typeof getImportedTourneyFingerprint === 'function')
    ? getImportedTourneyFingerprint
    : function(t) { return [(t.date || ''), (t.name || ''), (t.venue || '')].join('|').toLowerCase(); };
  var seen = {}, kept = [];
  list.forEach(function(t) {
    var k = keyOf(t);
    if (!seen[k]) { seen[k] = true; kept.push(t); }
  });
  var removed = list.length - kept.length;
  if (removed === 0) {
    alert('No duplicate tournaments found.');
    return;
  }
  if (!confirm('Found ' + removed + ' duplicate tournament(s) — same date, name and venue. Remove them? One copy of each is kept.')) return;
  kept.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
  window.tourneys = kept;
  tourneys = kept;
  save('tourneys', tourneys);
  renderCalendar();
  if (typeof showUndoToast === 'function') showUndoToast('Removed ' + removed + ' duplicate tournament(s)', function() {
    window.tourneys = list;
    tourneys = list;
    save('tourneys', tourneys);
    renderCalendar();
  });
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
  renderPlannedEvents();
  renderCalendarMonth();
  renderCalendarList();
  showCalUpdateLastRun();
}

// ── AI EVENT UPDATE — one button that web-searches upcoming tournaments and
// files them onto the calendar, with satellites/qualifiers classified at the
// source by Claude (no name-guessing, no manual tagging). Meant to be run every
// couple of weeks. Reuses the same Anthropic web-search plumbing as the Strategy
// tab's AI research. ──
var CAL_UPDATE_LAST_KEY = 'pokerhq_cal_update_last';

function setCalUpdateStatus(message, kind) {
  var el = document.getElementById('cal-update-status');
  if (!el) return;
  if (!message) { el.style.display = 'none'; el.textContent = ''; return; }
  var color = kind === 'ok' ? 'var(--green)' : kind === 'error' ? 'var(--red)' : 'rgba(255,255,255,.55)';
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = message;
}

// Show when the calendar was last refreshed by the AI — but never stomp on a
// live status message (only fills the line when it's otherwise empty).
function showCalUpdateLastRun() {
  var el = document.getElementById('cal-update-status');
  if (!el || (el.style.display !== 'none' && el.textContent)) return;
  var last = '';
  try { last = localStorage.getItem(CAL_UPDATE_LAST_KEY) || ''; } catch (e) {}
  if (!last) return;
  el.style.display = 'block';
  el.style.color = 'rgba(255,255,255,.4)';
  el.textContent = 'Last AI event update: ' + last + ' · safe to run every 2–3 weeks.';
}

function buildCalendarUpdatePrompt() {
  var today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  var br = (window.bankroll && window.bankroll.amount) || 0;
  var rule = (window.bankroll && window.bankroll.rule) || 15;
  var maxBuyin = rule ? Math.round(br / rule) : 0;
  var accThreshold = String(maxBuyin || 15000);
  var rollLine = br
    ? 'Bob\'s current bankroll is ₱' + br.toLocaleString() + ' on a ' + rule + ' buy-in rule, so his recommended max buy-in is about ₱' + maxBuyin.toLocaleString() + '.'
    : 'Bob runs a 15 buy-in bankroll rule and targets ₱3,000–₱15,000 buy-in events.';
  return 'You are Bob\'s personal poker intelligence analyst. Bob is a live MTT player based in Quezon City, Philippines. '
    + 'He plays weekends at Solaire Resort, Okada Manila, Casino Filipino, and City of Dreams Manila, and tracks the Asia-Pacific tournament circuit. '
    + rollLine + ' Today is ' + today + '.\n\n'
    + 'Use web search to thoroughly research UPCOMING tournaments. Search official / organiser sources and verify every event’s date and buy-in from at least one official source before listing it: '
    + 'Solaire Poker Room, pokerstars.com/live/manila (APPT Manila), okadamanila.com, pokerph.com, Casino Filipino, City of Dreams Manila, '
    + 'asianpokertour.com (APT), wsop.com/circuit, wpt.com, and Triton. '
    + 'Do NOT invent events, dates, buy-ins, or guarantees — if you cannot verify it, omit it. '
    + 'List EACH individual event on its own line (not just series headers). Cover confirmed events for roughly the next 6 weeks — Philippine venues plus Asia-Pacific stops reachable from Manila.\n\n'
    + 'CLASSIFY each event precisely — this is the most important part:\n'
    + '• "satellite" = ANY satellite, qualifier, mega/super satellite, feeder, step, or event whose prize is a SEAT or package into a bigger event rather than cash. Set "seatGuaranteed": true for these.\n'
    + '• "main" = the flagship Main Event of a series.\n'
    + '• "side" = any other regular cash-prize tournament.\n\n'
    + 'Convert all buy-ins to Philippine Peso (note the original amount in notes if converted).\n\n'
    + 'Respond with ONLY a single valid JSON object — no preamble, no explanation, no markdown code fences. Use exactly this shape:\n'
    + '{"asOf":"' + today + '","events":[{'
    + '"date":"Month DD, YYYY",'
    + '"name":"event name",'
    + '"venue":"full venue name",'
    + '"buyin":3000,'
    + '"gtd":"guarantee if known, else empty string",'
    + '"structure":"Freezeout|Re-entry|Turbo|Deep Stack|Bounty / PKO|Satellite / Qualifier|other",'
    + '"category":"satellite|main|side",'
    + '"seatGuaranteed":false,'
    + '"region":"ph|apac",'
    + '"accessible":true,'
    + '"notes":"late reg / flights / re-entry / original currency, etc.",'
    + '"source":"organiser or publication name",'
    + '"url":"https://exact-source-url"}]}\n'
    + '"buyin" MUST be a plain number in PHP (no currency symbol or commas). '
    + 'Set "accessible": true when the buy-in is at or below ₱' + accThreshold + ' (within direct reach), otherwise false. '
    + 'The "url" MUST be copied exactly from a search result — never invent or guess one. Return every confirmed event you can verify.';
}

function importCalendarUpdateEvents(events) {
  var added = [];
  (events || []).forEach(function (ev) {
    if (!ev || !ev.name) return;
    var bi = parseFloat(ev.buyin) || 0;
    var cat = String(ev.category || '').toLowerCase();
    var isSat = cat === 'satellite' || ev.seatGuaranteed === true;
    var t = {
      id: Date.now() + Math.random(),
      date: ev.date || '',
      name: ev.name,
      venue: ev.venue || '',
      buyin: bi,
      gtd: ev.gtd || '',
      structure: ev.structure || (isSat ? 'Satellite / Qualifier' : 'Regular'),
      type: cat === 'main' ? 'main' : 'side',
      category: isSat ? 'satellite' : cat,   // authoritative satellite tag from Claude
      sat: isSat,
      notes: ev.notes || '',
      source: ev.source || '',
      url: /^https?:\/\//i.test(ev.url || '') ? ev.url : '',
      status: (typeof gradeBuyin === 'function') ? gradeBuyin(bi) : 'skip'
    };
    var fpOf = (typeof getImportedTourneyFingerprint === 'function')
      ? getImportedTourneyFingerprint
      : function (x) { return [(x.date || ''), (x.name || ''), (x.venue || '')].join('|').toLowerCase(); };
    var fp = fpOf(t);
    var exists = (window.tourneys || []).some(function (x) { return fpOf(x) === fp; });
    if (exists) return;
    window.tourneys.push(t);
    added.push(t);
  });
  if (added.length) {
    tourneys = window.tourneys;
    tourneys.sort(function (a, b) { return (a.date || '').localeCompare(b.date || ''); });
    save('tourneys', tourneys);
    renderCalendar();
  }
  return added;
}

async function runCalendarUpdate() {
  var key = (typeof getStoredAnthropicKey === 'function') ? getStoredAnthropicKey() : '';
  var btn = document.getElementById('cal-update-btn');
  if (!key) {
    setCalUpdateStatus('Add your Anthropic API key first — IMPROVE → ♥ Strategy → AI Assistant.', 'error');
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ SEARCHING…'; }
  setCalUpdateStatus('🔎 Researching upcoming tournaments across PH & APAC… this can take 30–60s.', 'muted');
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 10000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 12 }],
        messages: [{ role: 'user', content: buildCalendarUpdatePrompt() }]
      })
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('API key was rejected (401) — check it in AI Assistant.');
      throw new Error('Claude API error (' + response.status + ')');
    }
    var data = await response.json();
    var searchCount = (data.usage && data.usage.server_tool_use && data.usage.server_tool_use.web_search_requests) || 0;
    var text = (data.content || [])
      .filter(function (c) { return c.type === 'text'; })
      .map(function (c) { return c.text || ''; })
      .join('\n');
    var parsed = null;
    try {
      var js = text.indexOf('{'), je = text.lastIndexOf('}');
      if (js !== -1 && je !== -1) parsed = JSON.parse(text.substring(js, je + 1));
    } catch (e) {}
    if (!parsed || !Array.isArray(parsed.events) || !parsed.events.length) {
      throw new Error('No usable events came back. Try again in a moment.');
    }
    var added = importCalendarUpdateEvents(parsed.events);
    var asOf = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
    try { localStorage.setItem(CAL_UPDATE_LAST_KEY, asOf); } catch (e) {}
    if (!added.length) {
      setCalUpdateStatus('✓ Already up to date — every verified event found is on your calendar (' + searchCount + ' searches).', 'ok');
    } else {
      var sats = added.filter(function (t) { return isSatelliteTourney(t); }).length;
      setCalUpdateStatus('✓ Added ' + added.length + ' event(s)' + (sats ? ' · ' + sats + ' satellite/qualifier' : '') + ' from ' + searchCount + ' searches. Review on the calendar.', 'ok');
      if (typeof showUndoToast === 'function') showUndoToast('Added ' + added.length + ' event(s) from AI update', function () {
        var ids = {}; added.forEach(function (t) { ids[t.id] = true; });
        window.tourneys = (window.tourneys || []).filter(function (t) { return !ids[t.id]; });
        tourneys = window.tourneys;
        save('tourneys', tourneys);
        renderCalendar();
      });
    }
  } catch (e) {
    setCalUpdateStatus('✗ ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = '✨ UPDATE EVENTS'; }
}

// The "Playing These" card at the top of the calendar — the events you've
// pinned, soonest first, with the running buy-in commitment. Empty (and the
// card hidden) until you pin something.
function renderPlannedEvents() {
  var wrap = document.getElementById('planned-events-wrap');
  if (!wrap) return;
  var planned = getUpcomingPlannedTourneys();
  if (!planned.length) { wrap.innerHTML = ''; return; }

  var totalBuyin = planned.reduce(function (s, p) { return s + (parseFloat(p.t.buyin) || 0); }, 0);
  var html = '<div class="planned-card">';
  html += '<div class="planned-hdr">';
  html += '<div class="planned-title"><span>★</span>Playing These</div>';
  html += '<div class="planned-summary">' + planned.length + ' event' + (planned.length > 1 ? 's' : '') +
    ' · ₱' + totalBuyin.toLocaleString() + ' committed</div>';
  html += '</div>';
  html += '<div class="planned-list">';
  planned.forEach(function (p) {
    var t = p.t;
    var d = p.range.start;
    var day = d.getDate();
    var mon = MONTH_SHORT_UPPER[d.getMonth()];
    var liveStatus = gradeBuyin(t.buyin);
    var sc = { target: 'ts-target', stretch: 'ts-stretch', skip: 'ts-skip' }[liveStatus] || 'ts-skip';
    var sl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[liveStatus] || 'SKIP';
    html += '<div class="event-row planning" id="planned-row-' + t.id + '">';
    html += '<div class="event-date-box"><div class="event-date-day">' + day + '</div><div class="event-date-mon">' + esc(mon) + '</div></div>';
    html += '<div class="event-info"><div class="event-name">' + esc(t.name) + '</div>';
    html += '<div class="event-meta">';
    if (t.venue) html += '<span>' + esc(t.venue) + '</span>';
    if (t.gtd) html += '<span>GTD: ' + esc(t.gtd) + '</span>';
    html += '</div></div>';
    html += '<div class="event-right">';
    html += '<div class="event-buyin">₱' + (t.buyin ? Number(t.buyin).toLocaleString() : '0') + '</div>';
    html += '<span class="tourney-status ' + sc + '">' + sl + '</span>';
    html += '<button class="sec-action" style="font-size:10px;padding:3px 9px;margin-top:2px;border-color:var(--green);color:var(--green)" onclick="startSessionFromTourney(' + t.id + ')">▶ START SESSION</button>';
    html += '<button class="pin-btn pinned" title="Remove from your plan" onclick="togglePlanning(' + t.id + ')">★</button>';
    html += '</div></div>';
  });
  html += '</div></div>';
  wrap.innerHTML = html;
}

var calView = 'month';
var calYear = new Date().getFullYear();
var calMonth = new Date().getMonth();

// When on, the month and list views show only the events you've pinned (★).
// The "Playing These" shortlist card is unaffected — it always shows your picks.
var calPlannedOnly = false;

// The events both calendar views should render — all tourneys, or just the
// pinned ones when the "Planned only" filter is active.
function visibleTourneys() {
  return calPlannedOnly
    ? (tourneys || []).filter(function (t) { return t && t.planning; })
    : (tourneys || []);
}

function togglePlannedOnly() {
  calPlannedOnly = !calPlannedOnly;
  var btn = document.getElementById('vbtn-planned');
  if (btn) {
    btn.classList.toggle('active', calPlannedOnly);
    btn.setAttribute('aria-pressed', String(calPlannedOnly));
  }
  renderCalendarMonth();
  renderCalendarList();
}

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
  // Pre-open the target's series group from the event's data, before the list
  // renders. Switching to the calendar re-renders the list (reading the saved
  // collapse state), so flipping the state here is what survives — a DOM-only
  // expand after render gets clobbered by that render. The event would
  // otherwise be hidden inside a collapsed group and the jump would land on
  // nothing.
  var t = (tourneys || []).find(function (e) { return e && e.id === id; });
  if (t) {
    var key = t.series || t.name;
    // Mark expanded regardless of the current state (stored collapse OR the
    // default-collapse for multi-event groups), so every render path — initial
    // or a later async one — shows the row rather than re-hiding it.
    if (key != null && _calCollapsed[key] !== false) { _calCollapsed[key] = false; saveCalCollapsed(); }
  }
  if (typeof switchGroup === 'function') switchGroup('plan', 'calendar');
  if (typeof setView === 'function') setView('list');
  setTimeout(function () {
    var row = document.getElementById('event-row-' + id);
    if (!row) return;
    // Backstop: open the group in the DOM too, in case it rendered collapsed.
    var group = row.closest('.series-group');
    if (group && group.classList.contains('collapsed')) {
      group.classList.remove('collapsed');
      var h = group.querySelector('.series-header');
      if (h) h.setAttribute('aria-expanded', 'true');
    }
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

  var tourneyRanges = visibleTourneys().map(function(t) {
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
      var sc = gradeBuyin(r.t.buyin);
      var typeBar = r.t.type === 'main' ? 'main-event-bar' : 'side-event-bar';
      var name = isStart || isSolo ? r.t.name.substring(0, 14) + (r.t.name.length > 14 ? '…' : '') : '';
      html += '<div class="cal-event-bar ' + sc + ' ' + pos + ' ' + typeBar + '" title="' + esc(r.t.name) + ' (' + esc(r.t.series) + ') — ₱' + r.t.buyin.toLocaleString() + '">' + esc(name) + '</div>';
    });
    html += '</div>';
  });

  gridEl.innerHTML = html;
}

// Collapse state for the list view's series groups, persisted across reloads
// and keyed by series key (series || name). When a key has never been toggled
// we fall back to a default: multi-event groups start collapsed so long
// festival slates open as a compact list of headers, single events stay open.
var _calCollapsed = (function () {
  try { return JSON.parse(localStorage.getItem('pokerhq_cal_collapsed') || '{}') || {}; }
  catch (e) { return {}; }
})();
function saveCalCollapsed() {
  try { localStorage.setItem('pokerhq_cal_collapsed', JSON.stringify(_calCollapsed)); } catch (e) {}
}
function isSeriesCollapsed(key, count) {
  return Object.prototype.hasOwnProperty.call(_calCollapsed, key) ? !!_calCollapsed[key] : count > 1;
}

// Toggle one group from its header; persist so the choice survives re-renders.
window.toggleSeriesGroup = function (headerEl) {
  var group = headerEl.closest('.series-group');
  if (!group) return;
  var key = group.getAttribute('data-key');
  var collapsed = !group.classList.contains('collapsed');
  group.classList.toggle('collapsed', collapsed);
  group.querySelector('.series-header').setAttribute('aria-expanded', String(!collapsed));
  if (key != null) { _calCollapsed[key] = collapsed; saveCalCollapsed(); }
};

// Expand / collapse every group at once (header buttons in the list view).
function setAllSeries(collapsed) {
  document.querySelectorAll('#calendar-list .series-group').forEach(function (g) {
    var key = g.getAttribute('data-key');
    g.classList.toggle('collapsed', collapsed);
    var h = g.querySelector('.series-header');
    if (h) h.setAttribute('aria-expanded', String(!collapsed));
    if (key != null) _calCollapsed[key] = collapsed;
  });
  saveCalCollapsed();
}
window.expandAllSeries = function () { setAllSeries(false); };
window.collapseAllSeries = function () { setAllSeries(true); };

function renderCalendarList() {
  var el = document.getElementById('calendar-list');
  if (!el) return;
  var list = visibleTourneys();
  if (!list.length) {
    el.innerHTML = calPlannedOnly
      ? '<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">No events pinned yet. Tap the ☆ on an event to add it to your plan.</div>'
      : '<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">No tournaments added. Click + ADD TOURNAMENT to start.</div>';
    return;
  }

  var seriesMap = {};
  var seriesOrder = [];
  list.forEach(function(t) {
    var key = t.series || t.name;
    if (!seriesMap[key]) {
      seriesMap[key] = [];
      seriesOrder.push(key);
    }
    seriesMap[key].push(t);
  });

  var html = '';
  if (seriesOrder.length > 1) {
    html += '<div class="series-tools">';
    html += '<button class="view-btn" onclick="expandAllSeries()">⊕ EXPAND ALL</button>';
    html += '<button class="view-btn" onclick="collapseAllSeries()">⊖ COLLAPSE ALL</button>';
    html += '</div>';
  }
  seriesOrder.forEach(function(key) {
    var events = seriesMap[key];
    var hasMain = events.some(function(e) { return e.type === 'main'; });
    var icon = hasMain ? '🏆' : '♠';
    var count = events.length;
    var collapsed = isSeriesCollapsed(key, count);

    // Buy-in range stays visible when the group is collapsed, so the read that
    // drives grading isn't lost behind a closed header.
    var buyins = events.map(function(e) { return e.buyin || 0; }).filter(function(n) { return n > 0; });
    var range = '';
    if (buyins.length) {
      var lo = Math.min.apply(null, buyins), hi = Math.max.apply(null, buyins);
      range = lo === hi ? '₱' + lo.toLocaleString() : '₱' + lo.toLocaleString() + '–₱' + hi.toLocaleString();
    }

    html += '<div class="series-group' + (collapsed ? ' collapsed' : '') + '" data-key="' + esc(key) + '">';
    html += '<div class="series-header" role="button" tabindex="0" aria-expanded="' + (!collapsed) + '"' +
      ' onclick="toggleSeriesGroup(this)"' +
      ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();toggleSeriesGroup(this);}">';
    html += '<span class="series-toggle" aria-hidden="true">▾</span>';
    html += '<span class="series-icon">' + icon + '</span>';
    html += '<span class="series-name">' + esc(key) + '</span>';
    if (range) html += '<span class="series-range">' + range + '</span>';
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
      var rowCls = (isMain ? 'event-row main-event' : 'event-row side-event') + (t.planning ? ' planning' : '');
      var badgeCls = isMain ? 'event-type-badge main' : 'event-type-badge side';
      var badgeTxt = isMain ? 'MAIN' : 'SIDE';
      var liveStatus = gradeBuyin(t.buyin);
      var sc = { target: 'ts-target', stretch: 'ts-stretch', skip: 'ts-skip' }[liveStatus] || 'ts-skip';
      var sl = { target: 'TARGET', stretch: 'STRETCH', skip: 'SKIP' }[liveStatus] || 'SKIP';

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
      html += '<button class="pin-btn' + (t.planning ? ' pinned' : '') + '" title="' + (t.planning ? 'Remove from your plan' : 'Add to your plan — mark you\'re playing this') + '" onclick="togglePlanning(' + t.id + ')">' + (t.planning ? '★' : '☆') + '</button>';
      html += '<button class="del-btn" title="Edit tournament" onclick="editTourney(' + t.id + ')">✎</button>';
      html += '<button class="del-btn" onclick="deleteTourney(' + t.id + ')">✕</button>';
      html += '</div></div>';
    });

    html += '</div></div>';
  });

  el.innerHTML = html;
}
