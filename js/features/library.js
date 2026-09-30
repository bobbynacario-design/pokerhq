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

// Is this calendar event a satellite / seat-qualifier? Checks name, structure,
// and notes for the usual ways these get labelled, so the satellite-tab pickers
// list only feeders and not the Main/side events they feed into.
function isSatelliteTourney(t) {
  if (!t) return false;
  // If Claude's AI event update classified this, TRUST that classification and
  // do not second-guess it. An explicit category ('satellite' | 'side' | 'main')
  // is authoritative — otherwise a side event whose notes mention "satellites
  // available" or "qualify via…" would wrongly leak into the satellite picker.
  if (t.sat === true) return true;
  var cat = String(t.category || '').toLowerCase();
  if (cat) return cat === 'satellite';
  // Manual "Satellite / Qualifier" structure pick from Add Tournament.
  if (/satellite|qualif/i.test(t.structure || '')) return true;
  // Legacy / hand-typed events with no classification: infer from the NAME only.
  // Notes are deliberately excluded — they're too noisy (they describe context,
  // not the event type) — and a bare "seat"/"sat" is excluded too ("Sat" =
  // Saturday). The name must actually say it's a satellite.
  return /satellite|satty|qualif|win (a|your) seat|seat scramble|feeder|mega ?sat\b|super ?sat\b|step \d/i.test(t.name || '');
}

// Calendar events as picker options — deduped by name, soonest first when a date
// is parseable, with buy-in/venue along for auto-fill. Pass a predicate to
// narrow the list (e.g. satellites only).
function collectEventOptions(predicate) {
  var list = window.tourneys || [];
  var seen = {}, out = [];
  list.forEach(function (t) {
    if (!t || !t.name) return;
    if (predicate && !predicate(t)) return;
    var key = t.name.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    var range = (typeof parseTourneyDateRange === 'function') ? parseTourneyDateRange(t) : null;
    out.push({ name: t.name, buyin: t.buyin || 0, venue: t.venue || '', start: range && range.start ? range.start.getTime() : null });
  });
  out.sort(function (a, b) {
    if (a.start == null && b.start == null) return 0;
    if (a.start == null) return 1;
    if (b.start == null) return -1;
    return a.start - b.start;
  });
  return out;
}
function getCalendarEventOptions() { return collectEventOptions(null); }
function getSatelliteEventOptions() { return collectEventOptions(isSatelliteTourney); }
// The inverse: the Main/big events you'd chase a seat into — everything that
// isn't itself a satellite. Feeds the "Target Event" pickers.
function getTargetEventOptions() { return collectEventOptions(function (t) { return !isSatelliteTourney(t); }); }

// Render <option>s (value + a ₱buy-in · venue label) for a datalist.
function eventOptionsHtml(opts) {
  return opts.map(function (o) {
    var label = o.buyin ? '₱' + o.buyin.toLocaleString() : '';
    if (o.venue) label += (label ? ' · ' : '') + o.venue;
    return '<option value="' + esc(o.name) + '"' + (label ? ' label="' + esc(label) + '"' : '') + '></option>';
  }).join('');
}

// Fill the two datalists the Satellites tab reads from: the Satellite Name field
// uses satellites/qualifiers only, while the "Target Event" fields use the
// Main/big events you'd win a seat into. You can still free-type in any field.
function populateCalendarEventsDatalist() {
  var sdl = document.getElementById('calendar-satellites-list');
  if (sdl) sdl.innerHTML = eventOptionsHtml(getSatelliteEventOptions());
  var tdl = document.getElementById('calendar-targets-list');
  if (tdl) tdl.innerHTML = eventOptionsHtml(getTargetEventOptions());
}

// When the typed/picked target matches a calendar event, pull its buy-in in as
// the direct buy-in (the figure the "vs direct" savings is measured against).
function onSatTargetEventInput() {
  var nameEl = document.getElementById('sat-target-input');
  var buyinEl = document.getElementById('sat-target-buyin-input');
  if (!nameEl || !buyinEl) return;
  var typed = nameEl.value.trim().toLowerCase();
  var match = getCalendarEventOptions().filter(function (o) { return o.name.toLowerCase() === typed; })[0];
  if (match && match.buyin) buyinEl.value = match.buyin;
}

// When the satellite name matches a satellite event on the calendar, fill in its
// venue and buy-in (only if those fields are still empty, so manual edits stick).
function onSatNameInput() {
  var nameEl = document.getElementById('sat-name');
  if (!nameEl) return;
  var typed = nameEl.value.trim().toLowerCase();
  var match = getSatelliteEventOptions().filter(function (o) { return o.name.toLowerCase() === typed; })[0];
  if (!match) return;
  var venueEl = document.getElementById('sat-venue');
  var buyinEl = document.getElementById('sat-buyin');
  if (venueEl && match.venue && !venueEl.value) venueEl.value = match.venue;
  if (buyinEl && match.buyin && !buyinEl.value) buyinEl.value = match.buyin;
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

var _editingSatId = null;

function setSatelliteModalTitle(text) {
  var el = document.querySelector('#modal-satellite .modal-title');
  if (el) el.textContent = text;
}

function openNewSatelliteModal() {
  _editingSatId = null;
  populateCalendarEventsDatalist();
  setSatelliteModalTitle('Log Satellite');
  ['sat-name', 'sat-venue', 'sat-buyin', 'sat-for', 'sat-notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var dateEl = document.getElementById('sat-date');
  if (dateEl) dateEl.value = todayLocal();
  if (typeof loadSatelliteTripField === 'function') loadSatelliteTripField(null);
  var resultEl = document.getElementById('sat-result');
  if (resultEl) resultEl.value = 'won';
  openModal('modal-satellite');
}

function editSatellite(id) {
  var s = satellites.find(function(x) { return x.id === id; });
  if (!s) return;
  populateCalendarEventsDatalist();
  document.getElementById('sat-date').value = s.date || '';
  document.getElementById('sat-name').value = s.name || '';
  document.getElementById('sat-venue').value = s.venue || '';
  document.getElementById('sat-buyin').value = s.buyin || '';
  document.getElementById('sat-result').value = s.result || 'won';
  document.getElementById('sat-for').value = s.forEvent || '';
  document.getElementById('sat-notes').value = s.notes || '';
  if (typeof loadSatelliteTripField === 'function') loadSatelliteTripField(s);
  _editingSatId = id;
  setSatelliteModalTitle('Edit Satellite');
  openModal('modal-satellite');
}

function addSatellite() {
  if (_editingSatId) {
    var existing = satellites.find(function(x) { return x.id === _editingSatId; });
    if (!existing) { _editingSatId = null; return; }
    existing.date = document.getElementById('sat-date').value || existing.date;
    existing.name = document.getElementById('sat-name').value || 'Satellite';
    existing.venue = document.getElementById('sat-venue').value || '';
    existing.buyin = parseFloat(document.getElementById('sat-buyin').value) || 0;
    existing.result = document.getElementById('sat-result').value;
    existing.forEvent = document.getElementById('sat-for').value || '';
    existing.notes = document.getElementById('sat-notes').value || '';
    if (typeof applySatelliteTripField === 'function') applySatelliteTripField(existing);
    window.satellites = satellites;
    save('satellites', satellites);
    _editingSatId = null;
    setSatelliteModalTitle('Log Satellite');
    closeModal('modal-satellite');
    renderSatellites();
    return;
  }
  var s = {
    id: Date.now(),
    date: document.getElementById('sat-date').value || todayLocal(),
    name: document.getElementById('sat-name').value || 'Satellite',
    venue: document.getElementById('sat-venue').value || '',
    buyin: parseFloat(document.getElementById('sat-buyin').value) || 0,
    result: document.getElementById('sat-result').value,
    forEvent: document.getElementById('sat-for').value || satTarget.name || '',
    notes: document.getElementById('sat-notes').value || ''
  };
  if (typeof applySatelliteTripField === 'function') applySatelliteTripField(s);
  satellites.unshift(s);
  window.satellites = satellites;
  save('satellites', satellites);
  closeModal('modal-satellite');
  ['sat-name', 'sat-venue', 'sat-buyin', 'sat-for', 'sat-notes'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('sat-result').value = 'won';
  if (typeof loadSatelliteTripField === 'function') loadSatelliteTripField(null);
  renderSatellites();
}

function deleteSatellite(id) {
  var idx = satellites.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removed = satellites[idx];
  satellites = satellites.filter(function(x) { return x.id !== id; });
  window.satellites = satellites;
  save('satellites', satellites);
  renderSatellites();
  if (typeof showUndoToast === 'function') showUndoToast('Satellite deleted: ' + (removed.name || ''), function() {
    satellites.splice(Math.min(idx, satellites.length), 0, removed);
    window.satellites = satellites;
    save('satellites', satellites);
    renderSatellites();
  });
}

function renderSatellites() {
  populateCalendarEventsDatalist();
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
    el.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--wa-20);font-family:var(--mono);font-size:13px">No satellites logged yet. Set a target and start logging your satellite attempts.</div>';
    return;
  }
  el.innerHTML = satellites.map(function(s) {
    var rc = { won: 'sat-won', lost: 'sat-lost', pending: 'sat-pending' }[s.result] || 'sat-lost';
    var rl = { won: '🎟 SEAT WON', lost: 'DID NOT WIN', pending: 'PENDING' }[s.result] || 'DID NOT WIN';
    return '<div class="sat-card"><div class="sat-card-left"><div class="sat-card-name">' + esc(s.name) + '</div><div class="sat-card-meta"><span>' + esc(s.date) + '</span><span>' + esc(s.venue) + '</span>' + (s.forEvent ? '<span>→ ' + esc(s.forEvent) + '</span>' : '') + (s.notes ? '<span>' + esc(s.notes) + '</span>' : '') + '</div></div><div class="sat-card-right"><div class="sat-buyin">₱' + s.buyin.toLocaleString() + '</div><span class="sat-result-badge ' + rc + '">' + rl + '</span><button class="del-btn" title="Edit satellite" onclick="editSatellite(' + s.id + ')">✎</button><button class="del-btn" onclick="deleteSatellite(' + s.id + ')">✕</button></div></div>';
  }).join('');
}

function toggleOppTag(btn) {
  btn.classList.toggle('selected');
  var tag = btn.dataset.tag;
  if (_selectedOppTags.includes(tag)) _selectedOppTags = _selectedOppTags.filter(function(t) { return t !== tag; });
  else _selectedOppTags.push(tag);
}

var _editingOppId = null;

function setOpponentModalTitle(text) {
  var el = document.querySelector('#modal-opponent .modal-title');
  if (el) el.textContent = text;
}

function applyOpponentTagSelection(tags) {
  _selectedOppTags = (tags || []).slice();
  document.querySelectorAll('.tag-toggle').forEach(function(b) {
    b.classList.toggle('selected', _selectedOppTags.indexOf(b.dataset.tag) !== -1);
  });
}

function openNewOpponentModal() {
  _editingOppId = null;
  setOpponentModalTitle('Add Villain');
  ['opp-name', 'opp-venue', 'opp-notes'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  applyOpponentTagSelection([]);
  openModal('modal-opponent');
}

function editOpponent(id) {
  var o = opponents.find(function(x) { return x.id === id; });
  if (!o) return;
  document.getElementById('opp-name').value = o.name || '';
  document.getElementById('opp-venue').value = o.venue || '';
  document.getElementById('opp-notes').value = o.notes || '';
  applyOpponentTagSelection(o.tags);
  _editingOppId = id;
  setOpponentModalTitle('Edit Villain');
  openModal('modal-opponent');
}

function addOpponent() {
  var name = document.getElementById('opp-name').value.trim();
  if (!name) return;
  if (_editingOppId) {
    var existing = opponents.find(function(x) { return x.id === _editingOppId; });
    if (!existing) { _editingOppId = null; return; }
    existing.name = name;
    existing.venue = document.getElementById('opp-venue').value || '';
    existing.tags = _selectedOppTags.slice();
    existing.notes = document.getElementById('opp-notes').value || '';
    existing.updatedAt = Date.now();   // the Review Inbox flags notes nobody has touched for a while
    window.opponents = opponents;
    save('opponents', opponents);
    document.getElementById('opp-name').value = '';
    document.getElementById('opp-venue').value = '';
    document.getElementById('opp-notes').value = '';
    applyOpponentTagSelection([]);
    _editingOppId = null;
    setOpponentModalTitle('Add Villain');
    closeModal('modal-opponent');
    renderOpponents();
    if (typeof renderActiveSessionSurface === 'function') renderActiveSessionSurface();
    return;
  }
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
  var idx = opponents.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removed = opponents[idx];
  opponents = opponents.filter(function(x) { return x.id !== id; });
  window.opponents = opponents;
  save('opponents', opponents);
  renderOpponents();
  if (typeof renderActiveSessionSurface === 'function') renderActiveSessionSurface();
  if (typeof showUndoToast === 'function') showUndoToast('Villain deleted: ' + (removed.name || ''), function() {
    opponents.splice(Math.min(idx, opponents.length), 0, removed);
    window.opponents = opponents;
    save('opponents', opponents);
    renderOpponents();
    if (typeof renderActiveSessionSurface === 'function') renderActiveSessionSurface();
  });
}

function renderOpponents() {
  var el = document.getElementById('opponent-list');
  if (!el) return;
  var q = (document.getElementById('opp-search') || {}).value || '';
  var filtered = q ? opponents.filter(function(o) {
    return o.name.toLowerCase().includes(q.toLowerCase()) || o.venue.toLowerCase().includes(q.toLowerCase()) || (o.notes || '').toLowerCase().includes(q.toLowerCase());
  }) : opponents;

  if (!filtered.length) {
    el.innerHTML = '<div style="padding:3rem;text-align:center;color:var(--wa-20);font-family:var(--mono);font-size:13px">' + (q ? 'No villains matching "' + esc(q) + '"' : 'No villains logged yet. Add a player you want to remember.') + '</div>';
    return;
  }
  el.innerHTML = filtered.map(function(o) {
    var tagHTML = (o.tags || []).map(function(t) { return '<span class="opp-tag ' + esc(t) + '">' + esc(t) + '</span>'; }).join('');
    return '<div class="opp-card"><div class="opp-top"><div><div class="opp-name">' + esc(o.name) + '</div><div class="opp-venue">' + esc(o.venue) + (o.added ? ' · Added ' + esc(o.added) : '') + '</div></div><button class="del-btn" title="Edit villain" onclick="editOpponent(' + o.id + ')">✎</button><button class="del-btn" onclick="deleteOpponent(' + o.id + ')">✕</button></div>' + (tagHTML ? '<div class="opp-tags">' + tagHTML + '</div>' : '') + (o.notes ? '<div class="opp-notes">' + esc(o.notes) + '</div>' : '') + '</div>';
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
    version: window.PokerHQBackup ? window.PokerHQBackup.CURRENT_VERSION : 1,
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
      wallet: cloneBackupValue(window.wallet || { balance: 0 }, { balance: 0 }),
      walletLedger: cloneBackupValue(window.walletLedger || [], []),
      trips: cloneBackupValue(window.trips || [], []),
      tripExpenses: cloneBackupValue(window.tripExpenses || [], []),
      satellites: cloneBackupValue(window.satellites || [], []),
      satTarget: cloneBackupValue(window.satTarget || { name: '', buyin: 0 }, { name: '', buyin: 0 }),
      opponents: cloneBackupValue(window.opponents || [], []),
      goals: cloneBackupValue(window.goals || {}, {}),
      reminderSettings: cloneBackupValue(window.reminderSettings || {}, {}),
      timer: cloneBackupValue(load('timer', null), null)
    }
  };
}

function downloadBackupPayload(payload, prefix) {
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = prefix + todayLocal() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportBackupJSON() {
  if (window._demoMode) {
    alert('Clear demo mode first to export your saved PokerHQ backup.');
    return;
  }
  downloadBackupPayload(getBackupSnapshot(), 'PokerHQ_Backup_');
}

// ── RESTORE SAFETY NET ──
// A restore replaces everything, so the state it overwrites is kept on this
// device (and offered as a file download if storage is full) until the next
// restore. Undo is available from the toast right away and from the button
// beside RESTORE JSON afterwards.
var PRE_RESTORE_STORAGE_KEY = 'pokerhq_pre_restore_snapshot';

function savePreRestoreSnapshot(snapshot) {
  try {
    localStorage.setItem(PRE_RESTORE_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (e) {
    return false;
  }
}

function loadPreRestoreSnapshot() {
  try {
    var raw = localStorage.getItem(PRE_RESTORE_STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return parsed && isPlainBackupObject(parsed.data) ? parsed : null;
  } catch (e) {
    return null;
  }
}

function clearPreRestoreSnapshot() {
  try { localStorage.removeItem(PRE_RESTORE_STORAGE_KEY); } catch (e) {}
  updateRestoreUndoButton();
}

function updateRestoreUndoButton() {
  var btn = document.getElementById('restore-undo-btn');
  if (!btn) return;
  var snap = loadPreRestoreSnapshot();
  btn.style.display = snap ? '' : 'none';
  if (snap) {
    var when = snap.exportedAt ? new Date(snap.exportedAt) : null;
    btn.title = 'Puts back the data you had before the last restore' + (when && !isNaN(when.getTime()) ? ' (' + when.toLocaleString() + ')' : '');
  }
}

function revertToSnapshot(snapshot) {
  applyBackupRestore(snapshot.data);
  clearPreRestoreSnapshot();
}

function undoLastRestore() {
  if (window._demoMode) {
    alert('Clear demo mode first.');
    return;
  }
  var snap = loadPreRestoreSnapshot();
  if (!snap) { updateRestoreUndoButton(); return; }
  var counts = snap.data.sessions.length + ' sessions, ' + snap.data.hands.length + ' hands, ' + snap.data.tourneys.length + ' tournaments';
  if (!confirm('Undo the last restore?\n\nThis puts back the data you had before it (' + counts + ') and replaces what is there now.')) return;
  revertToSnapshot(snap);
  alert('Previous data restored.');
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

// The rules (version check, upgrades, damaged-record clean-up) live in
// js/data/backup-format.js so they can be unit tested. Returns
// {ok, message} or {ok, data, notes, exportedAt, version, ...}.
function validateBackupPayload(parsed) {
  if (!window.PokerHQBackup) return { ok: false, message: 'Backup support did not load. Reload PokerHQ and try again.' };
  return window.PokerHQBackup.parse(parsed);
}

function applyBackupRestore(data) {
  // A restore is a replace: records missing from the backup must disappear from
  // the cloud copy too, so bypass the record-level sync merge.
  function persist(key, value) { save(key, value, { overwrite: true }); }
  window.sessions = data.sessions;
  sessions = window.sessions;
  persist('sessions', sessions);

  window.hands = data.hands;
  hands = window.hands;
  persist('hands', hands);

  window.tourneys = data.tourneys;
  tourneys = window.tourneys;
  persist('tourneys', tourneys);

  window.strategies = data.strategies;
  strategies = window.strategies;
  persist('strategies', strategies);

  window.newsItems = data.news;
  newsItems = window.newsItems;
  persist('news', newsItems);

  window.spotlights = data.spotlights;
  spotlights = window.spotlights;
  persist('spotlights', spotlights);

  window.bankroll = data.bankroll;
  bankroll = window.bankroll;
  persist('bankroll', bankroll);

  window.wallet = data.wallet || { balance: 0 };
  wallet = window.wallet;
  persist('wallet', wallet);

  window.walletLedger = Array.isArray(data.walletLedger) ? data.walletLedger : [];
  walletLedger = window.walletLedger;
  persist('walletLedger', walletLedger);

  window.trips = Array.isArray(data.trips) ? data.trips : [];
  trips = window.trips;
  persist('trips', trips);

  window.tripExpenses = Array.isArray(data.tripExpenses) ? data.tripExpenses : [];
  tripExpenses = window.tripExpenses;
  persist('tripExpenses', tripExpenses);

  satellites = data.satellites;
  window.satellites = satellites;
  persist('satellites', satellites);

  satTarget = data.satTarget;
  window.satTarget = satTarget;
  persist('satTarget', satTarget);

  opponents = data.opponents;
  window.opponents = opponents;
  persist('opponents', opponents);

  window.goals = data.goals || {};
  persist('goals', window.goals);

  window.reminderSettings = data.reminderSettings || {};
  persist('reminderSettings', window.reminderSettings);

  var timerState = data.timer || { running: false, startedAt: null, elapsed: 0 };
  if (typeof resetTimerState === 'function') resetTimerState();
  persist('timer', timerState);
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
  if (typeof renderMonthlyGoals === 'function') renderMonthlyGoals();
  if (typeof renderReminderSettings === 'function') renderReminderSettings();
  if (typeof refreshDashboard === 'function') refreshDashboard();
  if (typeof renderTreasury === 'function') renderTreasury();
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
      var made = checked.exportedAt ? new Date(checked.exportedAt) : null;
      var madeText = made && !isNaN(made.getTime()) ? '\nBacked up: ' + made.toLocaleString() : '';
      var noteText = checked.notes && checked.notes.length ? '\n\n' + checked.notes.join('\n') : '';
      var confirmed = confirm('Restore this PokerHQ backup and overwrite the current saved data for this profile?\n\n' + summary + madeText + noteText + '\n\nA copy of your current data is kept first, so you can undo this right after.');
      if (!confirmed) return;
      var before = getBackupSnapshot();
      if (!savePreRestoreSnapshot(before)) {
        // Too big for local storage — hand over a file instead of risking the data.
        downloadBackupPayload(before, 'PokerHQ_BeforeRestore_');
      }
      applyBackupRestore(checked.data);
      updateRestoreUndoButton();
      if (typeof showUndoToast === 'function') {
        showUndoToast('Backup restored · ' + summary, function() { revertToSnapshot(before); }, 30000);
      } else {
        alert('PokerHQ backup restored successfully.');
      }
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

function csvField(value) {
  var str = String(value === null || typeof value === 'undefined' ? '' : value);
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

function exportCSV() {
  if (!sessions.length) {
    alert('No sessions to export.');
    return;
  }
  if (window.PokerHQPrivacy && !window.PokerHQPrivacy.confirmExport('CSV file')) return;   // Privacy Mode: files carry real amounts
  var headers = ['Date', 'Tournament', 'Venue', 'Buy-in', 'Rebuys', 'Total Invested', 'Field', 'Position', 'Prize', 'Bounties', 'P&L', 'Hours', 'Result', 'Notes', 'Focus', 'Energy', 'Sleep', 'Fasting', 'Format'];
  var rows = sessions.map(function(s) {
    return [
      s.date || '', s.name || '', s.venue || '',
      s.buyin || 0, s.rebuy || 0, s.total || 0,
      s.field || '', s.position || '', s.prize || 0, s.bounties || 0, s.pnl || 0,
      s.hours || 0, s.result || '', s.notes || '',
      s.focus || '', s.energy || '', s.sleep || '', s.fasting || '', s.structure || ''
    ].map(csvField).join(',');
  });
  var csv = [headers.join(',')].concat(rows).join('\n');
  var blob = new Blob([csv], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'PokerHQ_Sessions_' + todayLocal() + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF() {
  if (window.PokerHQPrivacy && !window.PokerHQPrivacy.confirmExport('weekly report PDF')) return;   // Privacy Mode: files carry real amounts
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
      totalOut += sessionWinnings(s);
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
      var vals = [s.date, s.name.substring(0, 28), '₱' + s.total.toLocaleString(), s.position || '—', sessionWinnings(s) ? '₱' + sessionWinnings(s).toLocaleString() : '—', (s.pnl >= 0 ? '+' : '') + '₱' + fmt(s.pnl), { itm: 'ITM', final: 'Final', bust: 'Bust' }[s.result] || ''];
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

    doc.save('PokerHQ_Weekly_' + todayLocal() + '.pdf');
  } catch (err) {
    alert('PDF error: ' + err.message);
  }
}

updateRestoreUndoButton();
