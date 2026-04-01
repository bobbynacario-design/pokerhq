var satellites = [];
var satTarget = { name: '', buyin: 0 };
var opponents = [];
var _selectedOppTags = [];

function initSatelliteFeature() {
  satellites = load('satellites', []);
  satTarget = load('satTarget', { name: '', buyin: 0 });
  window.satellites = satellites;
  window.satTarget = satTarget;
}

function initOpponentFeature() {
  opponents = load('opponents', []);
  window.opponents = opponents;
}

function setSatTarget() {
  var name = document.getElementById('sat-target-input').value.trim();
  var buyin = parseFloat(document.getElementById('sat-target-buyin-input').value) || 0;
  if (!name) return;
  satTarget = { name: name, buyin: buyin };
  window.satTarget = satTarget;
  save('satTarget', satTarget);
  renderSatellites();
}

function addSatellite() {
  var s = {
    id: Date.now(),
    date: document.getElementById('sat-date').value || new Date().toISOString().split('T')[0],
    name: document.getElementById('sat-name').value || 'Satellite',
    venue: document.getElementById('sat-venue').value || '',
    buyin: parseFloat(document.getElementById('sat-buyin').value) || 0,
    result: document.getElementById('sat-result').value,
    forEvent: document.getElementById('sat-for').value || satTarget.name || '',
    notes: document.getElementById('sat-notes').value || ''
  };
  satellites.unshift(s);
  window.satellites = satellites;
  save('satellites', satellites);
  closeModal('modal-satellite');
  ['sat-name', 'sat-venue', 'sat-buyin', 'sat-for', 'sat-notes'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('sat-result').value = 'won';
  renderSatellites();
}

function deleteSatellite(id) {
  satellites = satellites.filter(function(x) { return x.id !== id; });
  window.satellites = satellites;
  save('satellites', satellites);
  renderSatellites();
}

function renderSatellites() {
  var played = satellites.length;
  var won = satellites.filter(function(s) { return s.result === 'won'; }).length;
  var invested = satellites.reduce(function(a, s) { return a + s.buyin; }, 0);
  var saved = won * (satTarget.buyin || 0) - invested;

  var nameEl = document.getElementById('sat-target-name');
  var buyinEl = document.getElementById('sat-target-buyin');
  if (nameEl) nameEl.textContent = satTarget.name || 'No target set';
  if (buyinEl) buyinEl.textContent = satTarget.buyin ? 'Direct buy-in: ₱' + satTarget.buyin.toLocaleString() : '';

  var pct = satTarget.buyin && invested > 0 ? Math.min(100, Math.round((invested / satTarget.buyin) * 100)) : 0;
  var pb = document.getElementById('sat-progress-bar');
  if (pb) pb.style.width = pct + '%';

  var els = {
    'sat-played': played,
    'sat-won': won,
    'sat-invested': '₱' + invested.toLocaleString(),
    'sat-saved': (saved >= 0 ? '+' : '') + '₱' + Math.abs(Math.round(saved)).toLocaleString()
  };
  Object.keys(els).forEach(function(id) {
    var e = document.getElementById(id);
    if (e) e.textContent = els[id];
  });

  var ti = document.getElementById('sat-target-input');
  var tb = document.getElementById('sat-target-buyin-input');
  if (ti && satTarget.name) ti.value = satTarget.name;
  if (tb && satTarget.buyin) tb.value = satTarget.buyin;

  var el = document.getElementById('satellite-list');
  if (!el) return;
  if (!satellites.length) {
    el.innerHTML = '<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">No satellites logged yet. Set a target and start logging your satellite attempts.</div>';
    return;
  }
  el.innerHTML = satellites.map(function(s) {
    var rc = { won: 'sat-won', lost: 'sat-lost', pending: 'sat-pending' }[s.result] || 'sat-lost';
    var rl = { won: '🎟 SEAT WON', lost: 'DID NOT WIN', pending: 'PENDING' }[s.result] || 'DID NOT WIN';
    return '<div class="sat-card"><div class="sat-card-left"><div class="sat-card-name">' + s.name + '</div><div class="sat-card-meta"><span>' + s.date + '</span><span>' + s.venue + '</span>' + (s.forEvent ? '<span>→ ' + s.forEvent + '</span>' : '') + (s.notes ? '<span>' + s.notes + '</span>' : '') + '</div></div><div class="sat-card-right"><div class="sat-buyin">₱' + s.buyin.toLocaleString() + '</div><span class="sat-result-badge ' + rc + '">' + rl + '</span><button class="del-btn" onclick="deleteSatellite(' + s.id + ')">✕</button></div></div>';
  }).join('');
}

function toggleOppTag(btn) {
  btn.classList.toggle('selected');
  var tag = btn.dataset.tag;
  if (_selectedOppTags.includes(tag)) _selectedOppTags = _selectedOppTags.filter(function(t) { return t !== tag; });
  else _selectedOppTags.push(tag);
}

function addOpponent() {
  var name = document.getElementById('opp-name').value.trim();
  if (!name) return;
  var o = {
    id: Date.now(),
    name: name,
    venue: document.getElementById('opp-venue').value || '',
    tags: _selectedOppTags.slice(),
    notes: document.getElementById('opp-notes').value || '',
    added: new Date().toLocaleDateString('en-PH')
  };
  opponents.unshift(o);
  window.opponents = opponents;
  save('opponents', opponents);
  document.getElementById('opp-name').value = '';
  document.getElementById('opp-venue').value = '';
  document.getElementById('opp-notes').value = '';
  _selectedOppTags = [];
  document.querySelectorAll('.tag-toggle').forEach(function(b) { b.classList.remove('selected'); });
  closeModal('modal-opponent');
  renderOpponents();
  if (typeof renderActiveSessionSurface === 'function') renderActiveSessionSurface();
}

function deleteOpponent(id) {
  opponents = opponents.filter(function(x) { return x.id !== id; });
  window.opponents = opponents;
  save('opponents', opponents);
  renderOpponents();
  if (typeof renderActiveSessionSurface === 'function') renderActiveSessionSurface();
}

function renderOpponents() {
  var el = document.getElementById('opponent-list');
  if (!el) return;
  var q = (document.getElementById('opp-search') || {}).value || '';
  var filtered = q ? opponents.filter(function(o) {
    return o.name.toLowerCase().includes(q.toLowerCase()) || o.venue.toLowerCase().includes(q.toLowerCase()) || (o.notes || '').toLowerCase().includes(q.toLowerCase());
  }) : opponents;

  if (!filtered.length) {
    el.innerHTML = '<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">' + (q ? 'No villains matching "' + q + '"' : 'No villains logged yet. Add a player you want to remember.') + '</div>';
    return;
  }
  el.innerHTML = filtered.map(function(o) {
    var tagHTML = (o.tags || []).map(function(t) { return '<span class="opp-tag ' + t + '">' + t + '</span>'; }).join('');
    return '<div class="opp-card"><div class="opp-top"><div><div class="opp-name">' + o.name + '</div><div class="opp-venue">' + o.venue + (o.added ? ' · Added ' + o.added : '') + '</div></div><button class="del-btn" onclick="deleteOpponent(' + o.id + ')">✕</button></div>' + (tagHTML ? '<div class="opp-tags">' + tagHTML + '</div>' : '') + (o.notes ? '<div class="opp-notes">' + o.notes + '</div>' : '') + '</div>';
  }).join('');
}

function cloneBackupValue(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(typeof value === 'undefined' ? fallback : value));
  } catch (e) {
    return fallback;
  }
}

function isPlainBackupObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getBackupSnapshot() {
  var cfg = window.PokerHQConfig || {};
  var profile = cfg.resolveProfileConfig ? cfg.resolveProfileConfig() : null;
  return {
    app: 'PokerHQ',
    format: 'backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: profile ? {
      id: profile.id || '',
      firestorePath: profile.firestorePath || '',
      localPrefix: profile.localPrefix || ''
    } : null,
    data: {
      sessions: cloneBackupValue(window.sessions || [], []),
      hands: cloneBackupValue(window.hands || [], []),
      tourneys: cloneBackupValue(window.tourneys || [], []),
      strategies: cloneBackupValue(window.strategies || [], []),
      news: cloneBackupValue(window.newsItems || [], []),
      spotlights: cloneBackupValue(window.spotlights || [], []),
      bankroll: cloneBackupValue(window.bankroll || { amount: 0, rule: 15 }, { amount: 0, rule: 15 }),
      satellites: cloneBackupValue(window.satellites || [], []),
      satTarget: cloneBackupValue(window.satTarget || { name: '', buyin: 0 }, { name: '', buyin: 0 }),
      opponents: cloneBackupValue(window.opponents || [], []),
      timer: cloneBackupValue(load('timer', null), null)
    }
  };
}

function exportBackupJSON() {
  if (window._demoMode) {
    alert('Clear demo mode first to export your saved PokerHQ backup.');
    return;
  }
  var payload = getBackupSnapshot();
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'PokerHQ_Backup_' + new Date().toISOString().split('T')[0] + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openBackupRestorePicker() {
  if (window._demoMode) {
    alert('Clear demo mode first to restore a saved PokerHQ backup.');
    return;
  }
  var input = document.getElementById('backup-restore-input');
  if (!input) {
    alert('Backup restore input is unavailable.');
    return;
  }
  input.value = '';
  input.click();
}

function validateBackupPayload(parsed) {
  var source = isPlainBackupObject(parsed) && isPlainBackupObject(parsed.data) ? parsed.data : parsed;
  if (!isPlainBackupObject(source)) {
    return { ok: false, message: 'That file is not a valid PokerHQ backup object.' };
  }

  var arrayKeys = ['sessions', 'hands', 'tourneys', 'strategies', 'news', 'spotlights', 'satellites', 'opponents'];
  for (var i = 0; i < arrayKeys.length; i++) {
    var key = arrayKeys[i];
    if (!Array.isArray(source[key])) {
      return { ok: false, message: 'Backup is missing a valid "' + key + '" array.' };
    }
  }

  if (!isPlainBackupObject(source.bankroll)) {
    return { ok: false, message: 'Backup is missing a valid bankroll object.' };
  }
  if (!isPlainBackupObject(source.satTarget)) {
    return { ok: false, message: 'Backup is missing a valid satellite target object.' };
  }
  if (!(source.timer === null || typeof source.timer === 'undefined' || isPlainBackupObject(source.timer))) {
    return { ok: false, message: 'Backup timer data is invalid.' };
  }

  return {
    ok: true,
    data: {
      sessions: cloneBackupValue(source.sessions, []),
      hands: cloneBackupValue(source.hands, []),
      tourneys: cloneBackupValue(source.tourneys, []),
      strategies: cloneBackupValue(source.strategies, []),
      news: cloneBackupValue(source.news, []),
      spotlights: cloneBackupValue(source.spotlights, []),
      bankroll: cloneBackupValue(source.bankroll, { amount: 0, rule: 15 }),
      satellites: cloneBackupValue(source.satellites, []),
      satTarget: cloneBackupValue(source.satTarget, { name: '', buyin: 0 }),
      opponents: cloneBackupValue(source.opponents, []),
      timer: typeof source.timer === 'undefined' ? null : cloneBackupValue(source.timer, null)
    }
  };
}

function applyBackupRestore(data) {
  window.sessions = data.sessions;
  sessions = window.sessions;
  save('sessions', sessions);

  window.hands = data.hands;
  hands = window.hands;
  save('hands', hands);

  window.tourneys = data.tourneys;
  tourneys = window.tourneys;
  save('tourneys', tourneys);

  window.strategies = data.strategies;
  strategies = window.strategies;
  save('strategies', strategies);

  window.newsItems = data.news;
  newsItems = window.newsItems;
  save('news', newsItems);

  window.spotlights = data.spotlights;
  spotlights = window.spotlights;
  save('spotlights', spotlights);

  window.bankroll = data.bankroll;
  bankroll = window.bankroll;
  save('bankroll', bankroll);

  satellites = data.satellites;
  window.satellites = satellites;
  save('satellites', satellites);

  satTarget = data.satTarget;
  window.satTarget = satTarget;
  save('satTarget', satTarget);

  opponents = data.opponents;
  window.opponents = opponents;
  save('opponents', opponents);

  var timerState = data.timer || { running: false, startedAt: null, elapsed: 0 };
  if (typeof resetTimerState === 'function') resetTimerState();
  save('timer', timerState);
  if (typeof restoreTimerState === 'function') restoreTimerState(timerState);

  if (typeof loadBankrollForm === 'function') loadBankrollForm();
  if (typeof updateBRMTip === 'function') updateBRMTip();
  if (typeof populateSessionDropdowns === 'function') populateSessionDropdowns();
  if (typeof renderSessionTable === 'function') renderSessionTable();
  if (typeof renderCalendar === 'function') renderCalendar();
  if (typeof renderCalendarMonth === 'function') renderCalendarMonth();
  if (typeof renderHands === 'function') renderHands();
  if (typeof renderStrategy === 'function') renderStrategy();
  if (typeof renderHeatmap === 'function') renderHeatmap();
  if (typeof renderSatellites === 'function') renderSatellites();
  if (typeof renderOpponents === 'function') renderOpponents();
  if (typeof renderStudyLoop === 'function') renderStudyLoop();
  if (typeof refreshDashboard === 'function') refreshDashboard();
  if (typeof renderActiveSessionSurface === 'function') renderActiveSessionSurface();
  if (typeof renderReliability === 'function') renderReliability();
}

function handleBackupRestoreFile(event) {
  if (window._demoMode) {
    alert('Clear demo mode first to restore a saved PokerHQ backup.');
    return;
  }
  var input = event && event.target ? event.target : null;
  var file = input && input.files && input.files[0] ? input.files[0] : null;
  if (!file) return;

  var reader = new FileReader();
  reader.onload = function(loadEvent) {
    try {
      var parsed = JSON.parse(loadEvent.target.result);
      var checked = validateBackupPayload(parsed);
      if (!checked.ok) {
        alert('Restore failed: ' + checked.message);
        return;
      }
      var summary = checked.data.sessions.length + ' sessions, ' + checked.data.hands.length + ' hands, ' + checked.data.tourneys.length + ' tournaments';
      var confirmed = confirm('Restore this PokerHQ backup and overwrite the current saved data for this profile?\n\n' + summary + '\n\nThis cannot be undone from inside the app.');
      if (!confirmed) return;
      applyBackupRestore(checked.data);
      alert('PokerHQ backup restored successfully.');
    } catch (err) {
      alert('Restore failed: ' + err.message);
    } finally {
      if (input) input.value = '';
    }
  };
  reader.onerror = function() {
    alert('Restore failed: could not read that file.');
    if (input) input.value = '';
  };
  reader.readAsText(file);
}

function exportCSV() {
  if (!sessions.length) {
    alert('No sessions to export.');
    return;
  }
  var headers = ['Date', 'Tournament', 'Venue', 'Buy-in', 'Rebuys', 'Total Invested', 'Field', 'Position', 'Prize', 'P&L', 'Hours', 'Result', 'Notes', 'Focus', 'Energy', 'Sleep', 'Fasting'];
  var rows = sessions.map(function(s) {
    return [
      s.date || '', s.name || '', s.venue || '',
      s.buyin || 0, s.rebuy || 0, s.total || 0,
      s.field || '', s.position || '', s.prize || 0, s.pnl || 0,
      s.hours || 0, s.result || '', '"' + (s.notes || '').replace(/"/g, "''") + '"',
      s.focus || '', s.energy || '', s.sleep || '', s.fasting || ''
    ].join(',');
  });
  var csv = [headers.join(',')].concat(rows).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'PokerHQ_Sessions_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF() {
  try {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var ML = 15, MR = 15, MT = 16, PW = 210, CW = PW - ML - MR;
    var y = MT;
    function chk(h) { if (y + h > 282) { doc.addPage(); y = MT; } }

    doc.setFillColor(212, 175, 55);
    doc.rect(ML, y, CW, 0.6, 'F');
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(212, 175, 55);
    doc.text('POKERHQ — WEEKLY REPORT', ML, y);
    y += 9;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(140, 140, 140);
    doc.text('Bob · ' + new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), ML, y);
    y += 5;
    doc.setFillColor(212, 175, 55);
    doc.rect(ML, y, CW, 0.6, 'F');
    y += 8;

    var br = bankroll.amount, rule = bankroll.rule || 15;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('BANKROLL SNAPSHOT', ML, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('Current Bankroll: ₱' + fmt(br) + '  |  BRM Rule: ' + rule + ' buy-ins  |  Recommended: ₱' + fmt(br / rule), ML, y);
    y += 8;

    var totalIn = 0, totalOut = 0, itm = 0;
    sessions.forEach(function(s) {
      totalIn += s.total || 0;
      totalOut += s.prize || 0;
      if (s.result === 'itm' || s.result === 'final') itm++;
    });
    var pnl = totalOut - totalIn, roi = totalIn > 0 ? ((pnl / totalIn) * 100).toFixed(1) : 0;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('CAREER STATS', ML, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('Tournaments: ' + sessions.length + '  |  Total P&L: ₱' + fmt(pnl) + '  |  ROI: ' + roi + '%  |  ITM: ' + itm + '/' + sessions.length, ML, y);
    y += 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('SESSION LOG', ML, y);
    y += 6;
    var cols = ['Date', 'Tournament', 'Buy-in', 'Position', 'Prize', 'P&L', 'Result'];
    var cws = [22, 55, 20, 18, 22, 20, 18];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    var cx = ML;
    cols.forEach(function(c, i) { doc.text(c, cx, y); cx += cws[i]; });
    y += 2;
    doc.setDrawColor(220, 220, 220);
    doc.line(ML, y, ML + CW, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    sessions.slice(0, 20).forEach(function(s) {
      chk(7);
      var isPos = s.pnl >= 0;
      var cx2 = ML;
      var vals = [s.date, s.name.substring(0, 28), '₱' + s.total.toLocaleString(), s.position || '—', s.prize ? '₱' + s.prize.toLocaleString() : '—', (s.pnl >= 0 ? '+' : '') + '₱' + fmt(s.pnl), { itm: 'ITM', final: 'Final', bust: 'Bust' }[s.result] || ''];
      doc.setTextColor(40, 40, 40);
      vals.forEach(function(v, i) {
        if (i === 5) doc.setTextColor(isPos ? 26 : 192, isPos ? 122 : 57, isPos ? 74 : 43);
        doc.text(String(v), cx2, y);
        cx2 += cws[i];
        doc.setTextColor(40, 40, 40);
      });
      y += 5;
    });
    y += 6;

    if (strategies.length) {
      chk(14);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text('STRATEGY NOTES', ML, y);
      y += 6;
      strategies.slice(0, 3).forEach(function(s) {
        chk(20);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(100, 60, 150);
        doc.text(s.topic + ' · ' + s.week, ML, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);
        var noteLines = doc.splitTextToSize(s.note.substring(0, 300), CW);
        noteLines.slice(0, 6).forEach(function(l) { chk(5); doc.text(l, ML, y); y += 4; });
        y += 3;
      });
    }

    doc.save('PokerHQ_Weekly_' + new Date().toISOString().split('T')[0] + '.pdf');
  } catch (err) {
    alert('PDF error: ' + err.message);
  }
}
