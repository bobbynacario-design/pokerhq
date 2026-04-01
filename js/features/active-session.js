var _activeSessionDraft = null;
var _timerInterval = null;
var _timerStart = null;
var _timerElapsed = 0; // ms
var _readinessState = null;
var _readinessBypass = false;

function initActiveSessionFeature() {
  _activeSessionDraft = loadLocalOnly('pokerhq_active_session_draft', null);
}

function getReliabilitySnapshot() {
  var meta = window._syncMeta || { status:'syncing', msg:'Loading...', updated:Date.now() };
  var queued = Object.keys(_offlineQueue || {}).length;
  var status = meta.status || 'syncing';
  if (!_isOnline) status = queued ? 'retrying' : 'offline';
  return {
    status: status,
    message: meta.msg || 'Loading...',
    queueCount: queued,
    mode: window._demoMode ? 'Demo data' : 'Real data',
    detail: !_isOnline ? (queued ? queued+' change'+(queued!==1?'s':'')+' waiting to sync' : 'Offline. Changes stay on this device until you reconnect.') :
      (status==='syncing' ? 'Writing changes now.' : status==='ok' ? 'Remote and local data are aligned.' : status==='error' ? 'Sync failed. Local data is still available.' : 'Waiting to reconnect.')
  };
}

function renderReliability() {
  var snap = getReliabilitySnapshot();
  var homeSync = document.getElementById('home-sync-chip');
  if (homeSync) homeSync.textContent = snap.message + (snap.queueCount ? ' · '+snap.queueCount+' pending sync change'+(snap.queueCount!==1?'s':'') : '');
  var demoChip = document.getElementById('home-demo-chip');
  if (demoChip) demoChip.textContent = snap.mode;
  var activeChip = document.getElementById('home-active-chip');
  if (activeChip) activeChip.textContent = getActiveSessionLabel() || (_timerInterval ? 'Timer running' : 'Not running');
  ['dashboard-reliability-wrap','play-reliability-wrap'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML =
      '<div class="reliability-card"><div class="reliability-top"><div class="reliability-main"><div class="reliability-icon">⛁</div><div><div class="reliability-title">Data safety and sync</div><div class="reliability-detail">'+snap.detail+'</div></div></div><div class="reliability-pill '+snap.status+'">'+snap.message+'</div></div><div class="reliability-meta"><div class="reliability-meta-card"><div class="reliability-meta-label">Pending sync</div><div class="reliability-meta-value">'+snap.queueCount+' change'+(snap.queueCount!==1?'s':'')+'</div></div><div class="reliability-meta-card"><div class="reliability-meta-label">Connection</div><div class="reliability-meta-value">'+(_isOnline ? 'Online' : 'Offline')+'</div></div><div class="reliability-meta-card"><div class="reliability-meta-label">Mode</div><div class="reliability-meta-value">'+snap.mode+'</div></div></div></div>';
  });
}

function getActiveSessionLabel() {
  if (!_activeSessionDraft) return '';
  var parts = [];
  if (_activeSessionDraft.name) parts.push(_activeSessionDraft.name);
  if (_activeSessionDraft.date) parts.push(_activeSessionDraft.date);
  return parts.join(' — ');
}

function persistActiveSessionDraft() {
  saveLocalOnly('pokerhq_active_session_draft', _activeSessionDraft);
  renderActiveSessionSurface();
}

function replaceActiveSessionDraft(seed) {
  _activeSessionDraft = {
    key: 'draft-'+Date.now(),
    bullets: 1,
    createdAt: Date.now()
  };
  if (seed) {
    Object.keys(seed).forEach(function(k) {
      if (typeof seed[k] !== 'undefined' && seed[k] !== null && seed[k] !== '') _activeSessionDraft[k] = seed[k];
    });
  }
  persistActiveSessionDraft();
}

function ensureActiveSessionDraft(seed) {
  if (!_activeSessionDraft) {
    _activeSessionDraft = {
      key: 'draft-'+Date.now(),
      bullets: 1,
      createdAt: Date.now()
    };
  }
  if (seed) {
    Object.keys(seed).forEach(function(k) {
      if (typeof seed[k] !== 'undefined' && seed[k] !== null && seed[k] !== '') _activeSessionDraft[k] = seed[k];
    });
  }
  persistActiveSessionDraft();
}

function clearActiveSessionDraft() {
  _activeSessionDraft = null;
  persistActiveSessionDraft();
}

function syncActiveDraftFromForm() {
  if (!_activeSessionDraft) return;
  _activeSessionDraft.date = document.getElementById('s-date').value || _activeSessionDraft.date || new Date().toISOString().split('T')[0];
  _activeSessionDraft.name = document.getElementById('s-name').value || _activeSessionDraft.name || '';
  _activeSessionDraft.venue = document.getElementById('s-venue').value || _activeSessionDraft.venue || '';
  _activeSessionDraft.buyin = parseFloat(document.getElementById('s-buyin').value) || _activeSessionDraft.buyin || 0;
  _activeSessionDraft.focus = parseFloat(document.getElementById('s-focus').value) || _activeSessionDraft.focus || 0;
  _activeSessionDraft.energy = parseFloat(document.getElementById('s-energy').value) || _activeSessionDraft.energy || 0;
  _activeSessionDraft.sleep = parseFloat(document.getElementById('s-sleep').value) || _activeSessionDraft.sleep || 0;
  _activeSessionDraft.fasting = document.getElementById('s-fasting').value || _activeSessionDraft.fasting || '';
  persistActiveSessionDraft();
}

function hydrateSessionFormFromDraft(force) {
  if (!_activeSessionDraft) return;
  var map = [
    ['s-date', _activeSessionDraft.date || new Date().toISOString().split('T')[0]],
    ['s-name', _activeSessionDraft.name || ''],
    ['s-venue', _activeSessionDraft.venue || ''],
    ['s-buyin', _activeSessionDraft.buyin || ''],
    ['s-focus', _activeSessionDraft.focus || ''],
    ['s-energy', _activeSessionDraft.energy || ''],
    ['s-sleep', _activeSessionDraft.sleep || ''],
    ['s-fasting', _activeSessionDraft.fasting || '']
  ];
  map.forEach(function(item) {
    var el = document.getElementById(item[0]);
    if (!el) return;
    if (force || !el.value) el.value = item[1];
  });
}

function getReadinessBankrollFitChoice(buyin) {
  var amount = bankroll && bankroll.amount ? bankroll.amount : 0;
  var rule = bankroll && bankroll.rule ? bankroll.rule : 15;
  if (!amount || !buyin) return '';
  var rec = amount / rule;
  var stretch = amount / (rule * 0.6);
  if (buyin <= rec) return 'target';
  if (buyin <= stretch) return 'stretch';
  return 'skip';
}

function getVenueOpponentCount(venue) {
  if (!venue || !window.opponents || !window.opponents.length) return 0;
  return window.opponents.filter(function(opp) {
    return (opp.venue || '').toLowerCase() === String(venue).toLowerCase();
  }).length;
}

function normalizeVenueName(value) {
  return String(value || '').trim().toLowerCase();
}

function getVenueScoutingEntries(venue) {
  var normalized = normalizeVenueName(venue);
  if (!normalized || !window.opponents || !window.opponents.length) return [];
  return window.opponents.filter(function(opp) {
    return normalizeVenueName(opp.venue) === normalized;
  });
}

function summarizeVillainNotes(notes) {
  var text = String(notes || '').trim();
  if (!text) return 'No tendency note saved yet.';
  if (text.length <= 120) return text;
  return text.substring(0, 117).trim() + '...';
}

function renderVenueScoutingBlock(venue) {
  if (!venue) return '';
  var entries = getVenueScoutingEntries(venue);
  if (!entries.length) {
    return '<div class="scouting-block"><div class="scouting-head"><div><div class="quick-panel-title">Venue scouting</div><div class="scouting-sub">No saved opponent notes for ' + venue + ' yet.</div></div></div></div>';
  }
  var cards = entries.slice(0, 4).map(function(opp) {
    var tagHTML = (opp.tags || []).map(function(tag) {
      return '<span class="opp-tag ' + tag + '">' + tag + '</span>';
    }).join('');
    return '<div class="scouting-entry"><div class="scouting-entry-top"><div class="scouting-name">' + (opp.name || 'Unknown opponent') + '</div><div class="scouting-added">' + (opp.added || '') + '</div></div>' + (tagHTML ? '<div class="opp-tags scouting-tags">' + tagHTML + '</div>' : '') + '<div class="scouting-note">' + summarizeVillainNotes(opp.notes) + '</div></div>';
  }).join('');
  var extra = entries.length > 4 ? '<div class="scouting-overflow">+' + (entries.length - 4) + ' more saved for this venue in Opponents.</div>' : '';
  return '<div class="scouting-block"><div class="scouting-head"><div><div class="quick-panel-title">Venue scouting</div><div class="scouting-sub">' + entries.length + ' known opponent' + (entries.length !== 1 ? 's' : '') + ' tagged for ' + venue + '.</div></div><button class="sec-action" onclick="switchGroup(\'improve\',\'opponents\')">OPEN OPPONENTS</button></div><div class="scouting-grid">' + cards + '</div>' + extra + '</div>';
}

function scoreReadinessState(state) {
  var score = 0;
  if (state.sleep === 'good') score += 1;
  else if (state.sleep === 'poor') score -= 2;

  if (state.energy === 'high') score += 1;
  else if (state.energy === 'low') score -= 2;

  if (state.food === 'fed') score += 1;
  else if (state.food === 'fasted') score -= 1;

  if (state.bankrollFit === 'target') score += 1;
  else if (state.bankrollFit === 'stretch') score -= 1;
  else if (state.bankrollFit === 'skip') score -= 3;
  else score -= 1;

  if (state.strategyReviewed === 'yes') score += 1;
  else if (state.strategyReviewed === 'no') score -= 1;

  if (state.villainNotes === 'yes') score += 1;

  var level = score >= 2 ? 'ready' : score >= -1 ? 'caution' : 'high-risk';
  var title = level === 'ready' ? 'Ready' : level === 'caution' ? 'Caution' : 'High risk';
  var detail = level === 'ready'
    ? 'Good enough to play. Keep the plan simple and start the session with intention.'
    : level === 'caution'
      ? 'Playable, but one weak input could matter later. Tighten the next decision or prep step before you sit.'
      : 'Too many pressure flags are stacked. This looks like a shot-taking or readiness leak, not just normal variance.';
  return { score: score, level: level, title: title, detail: detail };
}

function buildInitialReadinessState() {
  var existing = _activeSessionDraft && _activeSessionDraft.readiness ? _activeSessionDraft.readiness : null;
  if (existing && existing.status) {
    return {
      sleep: existing.sleep || '',
      energy: existing.energy || '',
      food: existing.food || '',
      bankrollFit: existing.bankrollFit || '',
      strategyReviewed: existing.strategyReviewed || 'no',
      villainNotes: existing.villainNotes || 'no'
    };
  }
  var venue = _activeSessionDraft && _activeSessionDraft.venue ? _activeSessionDraft.venue : '';
  var buyin = _activeSessionDraft && _activeSessionDraft.buyin ? _activeSessionDraft.buyin : 0;
  return {
    sleep: '',
    energy: '',
    food: '',
    bankrollFit: getReadinessBankrollFitChoice(buyin),
    strategyReviewed: 'no',
    villainNotes: getVenueOpponentCount(venue) > 0 ? 'yes' : 'no'
  };
}

function renderReadinessCheck() {
  if (!_readinessState) _readinessState = buildInitialReadinessState();
  var score = scoreReadinessState(_readinessState);
  var titleEl = document.getElementById('readiness-title');
  var detailEl = document.getElementById('readiness-detail');
  var pillEl = document.getElementById('readiness-pill');
  if (titleEl) titleEl.textContent = score.title;
  if (detailEl) detailEl.textContent = score.detail;
  if (pillEl) {
    pillEl.textContent = score.title;
    pillEl.className = 'readiness-pill ' + score.level;
  }
  document.querySelectorAll('[data-readiness-field]').forEach(function(btn) {
    var field = btn.getAttribute('data-readiness-field');
    var value = btn.getAttribute('data-readiness-value');
    btn.classList.toggle('selected', _readinessState[field] === value);
  });
}

function setReadinessField(field, value) {
  if (!_readinessState) _readinessState = buildInitialReadinessState();
  _readinessState[field] = value;
  renderReadinessCheck();
}

function applyRatingValue(inputId, btnGroupId, val) {
  var btns = document.querySelectorAll('#' + btnGroupId + ' .rating-btn');
  if (btns[val - 1]) setRating(inputId, btnGroupId, val, btns[val - 1]);
}

function applyFoodValue(value) {
  var map = { fasted: 'yes', fed: 'no', light: 'partial' };
  var idMap = { yes: 'fast-yes', no: 'fast-no', partial: 'fast-partial' };
  var fastVal = map[value] || '';
  var btn = fastVal ? document.getElementById(idMap[fastVal]) : null;
  if (btn) setFasting(fastVal, btn);
}

function applyReadinessToForm(state) {
  var sleepMap = { poor: 3, ok: 6, good: 8 };
  var energyMap = { low: 3, ok: 6, high: 8 };
  if (sleepMap[state.sleep]) applyRatingValue('s-sleep', 'sleep-btns', sleepMap[state.sleep]);
  if (energyMap[state.energy]) applyRatingValue('s-energy', 'energy-btns', energyMap[state.energy]);
  if (state.food) applyFoodValue(state.food);
}

function openReadinessCheck() {
  ensureActiveSessionDraft({ date: document.getElementById('s-date').value || new Date().toISOString().split('T')[0] });
  syncActiveDraftFromForm();
  _readinessState = buildInitialReadinessState();
  renderReadinessCheck();
  openModal('modal-readiness');
}

function skipReadinessCheck() {
  _readinessState = null;
  closeModal('modal-readiness');
  _readinessBypass = true;
  startTimer();
  _readinessBypass = false;
}

function confirmReadinessCheck() {
  if (!_readinessState) _readinessState = buildInitialReadinessState();
  var score = scoreReadinessState(_readinessState);
  ensureActiveSessionDraft();
  _activeSessionDraft.readiness = {
    sleep: _readinessState.sleep || '',
    energy: _readinessState.energy || '',
    food: _readinessState.food || '',
    bankrollFit: _readinessState.bankrollFit || '',
    strategyReviewed: _readinessState.strategyReviewed || '',
    villainNotes: _readinessState.villainNotes || '',
    status: score.level,
    checkedAt: Date.now()
  };
  applyReadinessToForm(_activeSessionDraft.readiness);
  persistActiveSessionDraft();
  closeModal('modal-readiness');
  _readinessBypass = true;
  startTimer();
  _readinessBypass = false;
}

function renderActiveSessionSurface() {
  var targetIds = ['dashboard-active-session-wrap','play-active-session-wrap'];
  var timerState = _timerInterval ? 'Running' : (_timerElapsed > 0 ? 'Paused' : 'Ready');
  var label = getActiveSessionLabel();
  var hasDraft = !!_activeSessionDraft || _timerInterval || _timerElapsed > 0;
  var homeTitle = document.getElementById('home-command-title');
  var homeSub = document.getElementById('home-command-sub');
  if (homeTitle && homeSub) {
    if (hasDraft) {
      homeTitle.textContent = label || 'Session in progress';
      homeSub.textContent = 'PokerHQ is holding your active play context, timer state, and quick capture actions in PLAY.';
    } else {
      homeTitle.textContent = sessions.length ? 'Ready for your next tournament.' : 'Start with demo mode or your first event.';
      homeSub.textContent = sessions.length ? 'Choose the next event, start a session, then review what to repeat or fix.' : 'Load sample data or log your first tournament to see the full workflow.';
    }
  }
  targetIds.forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (!hasDraft) {
      if (id==='play-active-session-wrap') {
        el.innerHTML = '';
      } else {
        el.innerHTML = '';
      }
      return;
    }
    var bullets = (_activeSessionDraft && _activeSessionDraft.bullets) ? _activeSessionDraft.bullets : 1;
    var focus = _activeSessionDraft && _activeSessionDraft.focus ? _activeSessionDraft.focus+'/10' : 'Not set';
    var energy = _activeSessionDraft && _activeSessionDraft.energy ? _activeSessionDraft.energy+'/10' : 'Not set';
    var venue = _activeSessionDraft && _activeSessionDraft.venue ? _activeSessionDraft.venue : 'Venue not set';
    var scouting = _activeSessionDraft && _activeSessionDraft.venue ? renderVenueScoutingBlock(_activeSessionDraft.venue) : '';
    var buyin = _activeSessionDraft && _activeSessionDraft.buyin ? '₱'+fmt(_activeSessionDraft.buyin) : 'Buy-in not set';
    el.innerHTML =
      '<div class="active-session-card"><div class="active-session-top"><div><div class="surface-kicker">Play</div><div class="active-session-title">'+(label || 'Active session')+'</div><div class="active-session-sub">'+venue+' · '+buyin+' · Timer '+timerState.toLowerCase()+'. Quick actions stay linked to this run.</div></div><div class="surface-actions"><button class="sec-action" onclick="switchGroup(\'play\',\'sessions\')">OPEN PLAY</button><button class="sec-action" onclick="endActiveSession()">END SESSION</button></div></div><div class="active-session-grid"><div class="active-session-metric"><div class="active-session-metric-label">Timer</div><div class="active-session-metric-value" id="active-session-timer-copy">'+(document.getElementById('timer-display') ? document.getElementById('timer-display').textContent : '00:00:00')+'</div></div><div class="active-session-metric"><div class="active-session-metric-label">Bullets</div><div class="active-session-metric-value">'+bullets+'</div></div><div class="active-session-metric"><div class="active-session-metric-label">Focus</div><div class="active-session-metric-value">'+focus+'</div></div><div class="active-session-metric"><div class="active-session-metric-label">Energy</div><div class="active-session-metric-value">'+energy+'</div></div></div><div class="active-session-actions"><button class="sec-action primary" onclick="openHandModalForActiveSession()">CAPTURE HAND</button><button class="sec-action" onclick="openActiveOpponentCapture()">CAPTURE VILLAIN NOTE</button><button class="sec-action" onclick="jumpToMentalCheckin()">MENTAL CHECK-IN</button><button class="sec-action" onclick="logTimerToSession()">LOG TIMER TO SESSION</button></div>'+scouting+'<div class="active-session-quick"><div class="quick-panel"><div class="quick-panel-title">Quick check-in</div><div class="quick-checkins"><button class="quick-checkin" onclick="applyQuickCheckin(\'rough\')">ROUGH</button><button class="quick-checkin" onclick="applyQuickCheckin(\'steady\')">STEADY</button><button class="quick-checkin" onclick="applyQuickCheckin(\'sharp\')">SHARP</button></div></div><div class="quick-panel"><div class="quick-panel-title">Re-entry / bullet count</div><div class="quick-counter"><div><div class="status-sub" style="margin-top:0">Track bullets before you log the final result.</div></div><div class="counter-controls"><button class="counter-btn" onclick="updateBulletCount(-1)">−</button><div class="counter-value">'+bullets+'</div><button class="counter-btn" onclick="updateBulletCount(1)">+</button></div></div></div></div></div>';
  });
  var empty = document.getElementById('play-empty-wrap');
  if (empty) {
    empty.innerHTML = hasDraft ? '' : '<div class="play-empty"><div class="play-empty-title">No active session yet</div><div class="play-empty-sub">Start from CALENDAR LIST when you have a scheduled event, or use HOME only for a manual session.</div><button class="sec-action" onclick="startSessionFromHome()">MANUAL SESSION</button></div>';
  }
  renderReliability();
}

function jumpToMentalCheckin() {
  switchGroup('play','sessions');
  setTimeout(function() {
    var card = document.querySelector('.mental-card');
    if (card) card.scrollIntoView({ behavior:'smooth', block:'center' });
  }, 160);
}

function applyQuickCheckin(mode) {
  ensureActiveSessionDraft();
  var presets = {
    rough: { focus:4, energy:4, sleep:4, fasting:'no' },
    steady:{ focus:7, energy:7, sleep:6, fasting:'partial' },
    sharp: { focus:9, energy:8, sleep:8, fasting:'yes' }
  };
  var p = presets[mode];
  if (!p) return;
  _activeSessionDraft.focus = p.focus;
  _activeSessionDraft.energy = p.energy;
  _activeSessionDraft.sleep = p.sleep;
  _activeSessionDraft.fasting = p.fasting;
  hydrateSessionFormFromDraft(true);
  persistActiveSessionDraft();
}

function updateBulletCount(delta) {
  ensureActiveSessionDraft();
  _activeSessionDraft.bullets = Math.max(1, (_activeSessionDraft.bullets || 1) + delta);
  persistActiveSessionDraft();
}

function openActiveOpponentCapture() {
  ensureActiveSessionDraft();
  openModal('modal-opponent');
  var venue = document.getElementById('opp-venue');
  var notes = document.getElementById('opp-notes');
  if (venue && _activeSessionDraft.venue && !venue.value) venue.value = _activeSessionDraft.venue;
  if (notes && !notes.value) notes.value = 'Seen during '+(getActiveSessionLabel() || 'active session')+'. ';
}

function openHandModalForActiveSession() {
  ensureActiveSessionDraft({ date:new Date().toISOString().split('T')[0] });
  if (window.prepareNewHandForm) {
    prepareNewHandForm({
      sessionId: 0,
      sessionLabel: getActiveSessionLabel() || 'Active session',
      pendingSessionKey: _activeSessionDraft.key || '',
      result: 'lost'
    });
  }
  openModal('modal-hand');
  var keyEl = document.getElementById('h-pending-session-key');
  if (keyEl) keyEl.value = _activeSessionDraft.key || '';
  var linkEl = document.getElementById('h-session-link');
  if (linkEl) linkEl.value = '';
  var labelEl = document.getElementById('h-session');
  if (labelEl) labelEl.value = getActiveSessionLabel() || 'Active session';
}

function resetTimerState() {
  if (_timerInterval) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
  _timerElapsed = 0;
  _timerStart = null;
  var disp = document.getElementById('timer-display');
  if (disp) disp.textContent = '00:00:00';
  var startBtn = document.getElementById('timer-start-btn');
  var stopBtn = document.getElementById('timer-stop-btn');
  var logBtn = document.getElementById('timer-log-btn');
  if (startBtn) {
    startBtn.style.display = 'inline-block';
    startBtn.textContent = 'START';
  }
  if (stopBtn) stopBtn.style.display = 'none';
  if (logBtn) logBtn.style.display = 'none';
  save('timer', {running:false, startedAt:null, elapsed:0});
}

function endActiveSession() {
  clearSessionForm();
  clearActiveSessionDraft();
  resetTimerState();
}

function cancelSessionStart() {
  endActiveSession();
}

function startSessionFromHome() {
  switchGroup('play','sessions');
  if (!_activeSessionDraft) {
    replaceActiveSessionDraft({ date:new Date().toISOString().split('T')[0] });
  }
  hydrateSessionFormFromDraft(false);
  startTimer();
}

function startTimer() {
  if (_timerInterval) return;
  ensureActiveSessionDraft({ date:document.getElementById('s-date').value || new Date().toISOString().split('T')[0] });
  if (!_readinessBypass && !_timerElapsed && !(_activeSessionDraft && _activeSessionDraft.readiness)) {
    openReadinessCheck();
    return;
  }
  syncActiveDraftFromForm();
  _timerStart = Date.now() - _timerElapsed;
  _timerInterval = setInterval(updateTimerDisplay, 1000);
  document.getElementById('timer-start-btn').style.display = 'none';
  document.getElementById('timer-stop-btn').style.display = 'inline-block';
  document.getElementById('timer-log-btn').style.display = 'none';
  save('timer', {running:true, startedAt:_timerStart, elapsed:0});
  renderActiveSessionSurface();
}

function stopTimer() {
  if (!_timerInterval) return;
  clearInterval(_timerInterval);
  _timerInterval = null;
  _timerElapsed = Date.now() - _timerStart;
  document.getElementById('timer-start-btn').style.display = 'inline-block';
  document.getElementById('timer-stop-btn').style.display = 'none';
  document.getElementById('timer-log-btn').style.display = 'inline-block';
  document.getElementById('timer-start-btn').textContent = 'RESUME';
  save('timer', {running:false, startedAt:null, elapsed:_timerElapsed});
  renderActiveSessionSurface();
}

function updateTimerDisplay() {
  var elapsed = Date.now() - _timerStart;
  var h = Math.floor(elapsed/3600000);
  var m = Math.floor((elapsed%3600000)/60000);
  var s = Math.floor((elapsed%60000)/1000);
  var el = document.getElementById('timer-display');
  if (el) el.textContent = pad(h)+':'+pad(m)+':'+pad(s);
  var copy = document.getElementById('active-session-timer-copy');
  if (copy) copy.textContent = el ? el.textContent : pad(h)+':'+pad(m)+':'+pad(s);
}

function pad(n) { return n < 10 ? '0'+n : ''+n; }

function logTimerToSession() {
  var hours = _timerElapsed / 3600000;
  var hoursField = document.getElementById('s-hours');
  if (hoursField) hoursField.value = hours.toFixed(1);
  switchGroup('play','sessions');
  alert('Timer logged: '+hours.toFixed(1)+'h. Finish the session result below and PokerHQ will open the debrief automatically.');
  _timerElapsed = 0;
  _timerStart = null;
  var el = document.getElementById('timer-display');
  if (el) el.textContent = '00:00:00';
  document.getElementById('timer-start-btn').style.display = 'inline-block';
  document.getElementById('timer-start-btn').textContent = 'START';
  document.getElementById('timer-stop-btn').style.display = 'none';
  document.getElementById('timer-log-btn').style.display = 'none';
  save('timer', {running:false, startedAt:null, elapsed:0});
  renderActiveSessionSurface();
}

function restoreTimerState(state) {
  if (!state) return;
  if (state.running && state.startedAt) {
    if (_timerInterval) return;
    _timerStart = state.startedAt;
    _timerElapsed = 0;
    _timerInterval = setInterval(updateTimerDisplay, 1000);
    document.getElementById('timer-start-btn').style.display = 'none';
    document.getElementById('timer-stop-btn').style.display = 'inline-block';
    document.getElementById('timer-log-btn').style.display = 'none';
    updateTimerDisplay();
    renderActiveSessionSurface();
  } else if (state.elapsed > 0) {
    if (_timerInterval) return;
    _timerElapsed = state.elapsed;
    var e = state.elapsed;
    var h = Math.floor(e/3600000), m = Math.floor((e%3600000)/60000), s = Math.floor((e%60000)/1000);
    var dispEl = document.getElementById('timer-display');
    if (dispEl) dispEl.textContent = pad(h)+':'+pad(m)+':'+pad(s);
    document.getElementById('timer-start-btn').style.display = 'inline-block';
    document.getElementById('timer-start-btn').textContent = 'RESUME';
    document.getElementById('timer-stop-btn').style.display = 'none';
    document.getElementById('timer-log-btn').style.display = 'inline-block';
    renderActiveSessionSurface();
  }
}
window.restoreTimerState = restoreTimerState;

function setRating(inputId, btnGroupId, val, btn) {
  document.getElementById(inputId).value = val;
  document.querySelectorAll('#' + btnGroupId + ' .rating-btn').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  document.querySelectorAll('#' + btnGroupId + ' .rating-btn').forEach(function(b, i) {
    if (i < val) {
      var hue = Math.round(i * (120 / 9));
      b.style.background = 'hsla(' + hue + ',60%,40%,0.4)';
      b.style.borderColor = 'hsla(' + hue + ',60%,40%,0.6)';
      b.style.color = 'hsla(' + hue + ',80%,75%,1)';
    } else {
      b.style.background = '';
      b.style.borderColor = '';
      b.style.color = '';
      b.classList.remove('selected');
    }
  });
  btn.style.background = '';
  btn.classList.add('selected');
  syncActiveDraftFromForm();
}

function setFasting(val, btn) {
  document.getElementById('s-fasting').value = val;
  document.querySelectorAll('.fast-btn').forEach(function(b) { b.classList.remove('selected'); });
  btn.classList.add('selected');
  syncActiveDraftFromForm();
}

function clearRatings() {
  ['focus-btns', 'energy-btns', 'sleep-btns'].forEach(function(gid) {
    document.querySelectorAll('#' + gid + ' .rating-btn').forEach(function(b) {
      b.classList.remove('selected');
      b.style.background = '';
      b.style.borderColor = '';
      b.style.color = '';
    });
  });
  document.querySelectorAll('.fast-btn').forEach(function(b) { b.classList.remove('selected'); });
  ['s-focus', 's-energy', 's-sleep', 's-fasting'].forEach(function(id) {
    var e = document.getElementById(id);
    if (e) e.value = '';
  });
}

function startSessionFromTourney(tid) {
  var t = tourneys.find(function(x){ return x.id===tid; });
  if (!t) return;
  var rawDate = t.date || '';
  var parsedDate = '';
  var MONTHS = {january:'01',february:'02',march:'03',april:'04',may:'05',june:'06',july:'07',august:'08',september:'09',october:'10',november:'11',december:'12'};
  var dm = rawDate.match(/(\w+)\s+(\d{1,2}),?\s*(\d{4})/);
  if (dm) {
    var mon = MONTHS[dm[1].toLowerCase()] || '01';
    var day = dm[2].length===1 ? '0'+dm[2] : dm[2];
    parsedDate = dm[3]+'-'+mon+'-'+day;
  }
  clearSessionForm();
  clearActiveSessionDraft();
  resetTimerState();
  replaceActiveSessionDraft({
    date: parsedDate || new Date().toISOString().split('T')[0],
    name: t.name || '',
    venue: t.venue || '',
    buyin: t.buyin || 0
  });
  switchGroup('play','sessions');
  setTimeout(function(){
    document.getElementById('s-name').value  = t.name || '';
    document.getElementById('s-venue').value = t.venue || '';
    document.getElementById('s-buyin').value = t.buyin || '';
    document.getElementById('s-date').value = parsedDate || new Date().toISOString().split('T')[0];
    syncActiveDraftFromForm();
    var fc = document.querySelector('.form-card');
    if (fc) fc.scrollIntoView({behavior:'smooth', block:'start'});
    startTimer();
  }, 200);
}
