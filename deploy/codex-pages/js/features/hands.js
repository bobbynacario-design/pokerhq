function populateSessionDropdowns() {
  var opts = '<option value="">Select session (optional)...</option>';
  sessions.forEach(function(s) {
    opts += '<option value="' + s.id + '">' + esc(s.date) + ' — ' + esc(s.name) + '</option>';
  });
  ['h-session-link', 'voice-session-link', 'hand-session-filter'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var isFilter = id === 'hand-session-filter';
    el.innerHTML = isFilter ? '<option value="">All sessions</option>' + sessions.map(function(s) { return '<option value="' + s.id + '">' + esc(s.date) + ' — ' + esc(s.name) + '</option>'; }).join('') : opts;
  });
}

var _editingHandId = null;

function setHandModalTitle(text) {
  var el = document.querySelector('#modal-hand .modal-title');
  if (el) el.textContent = text;
}

function editHand(id) {
  var h = hands.find(function(x) { return x.id === id; });
  if (!h) return;
  populateSessionDropdowns();
  var sessionLinkEl = document.getElementById('h-session-link');
  var sessionLabelEl = document.getElementById('h-session');
  var pendingKeyEl = document.getElementById('h-pending-session-key');
  if (sessionLinkEl) sessionLinkEl.value = h.sessionId ? String(h.sessionId) : '';
  if (sessionLabelEl) sessionLabelEl.value = h.session || '';
  if (pendingKeyEl) pendingKeyEl.value = h.pendingSessionKey || '';
  var fields = { 'h-title': h.title || '', 'h-desc': h.desc || '', 'h-lesson': h.lesson || '' };
  Object.keys(fields).forEach(function(fid) {
    var el = document.getElementById(fid);
    if (el) el.value = fields[fid];
  });
  var resultEl = document.getElementById('h-result');
  if (resultEl) resultEl.value = h.result || 'lost';
  resetHandReplayFields('h-');
  var replay = h.replay || {};
  var replayIds = {
    heroPosition: 'h-hero-pos', villainPosition: 'h-villain-pos', stacks: 'h-stacks',
    board: 'h-board', preflop: 'h-preflop', flop: 'h-flop', turn: 'h-turn', river: 'h-river'
  };
  Object.keys(replayIds).forEach(function(key) {
    var el = document.getElementById(replayIds[key]);
    if (el && replay[key]) el.value = replay[key];
  });
  _editingHandId = id;
  setHandModalTitle('Edit Hand');
  openModal('modal-hand');
}

function toMultilineHtml(text) {
  return esc(text || '').replace(/\n/g, '<br>');
}

function getHandResultMeta(result) {
  return {
    className: { won: 'hand-won', lost: 'hand-lost', fold: 'hand-fold' }[result] || 'hand-fold',
    label: { won: 'WON', lost: 'LOST', fold: 'FOLD' }[result] || 'FOLD',
    color: { won: '#2DB87A', lost: '#E85C5C', fold: 'rgba(255,255,255,.4)' }[result] || 'rgba(255,255,255,.4)'
  };
}

function collectReplayFields(prefix) {
  var ids = {
    heroPosition: prefix + 'hero-pos',
    villainPosition: prefix + 'villain-pos',
    stacks: prefix + 'stacks',
    board: prefix + 'board',
    preflop: prefix + 'preflop',
    flop: prefix + 'flop',
    turn: prefix + 'turn',
    river: prefix + 'river'
  };
  var replay = {};
  Object.keys(ids).forEach(function(key) {
    var el = document.getElementById(ids[key]);
    var value = el ? el.value.trim() : '';
    if (value) replay[key] = value;
  });
  return Object.keys(replay).length ? replay : null;
}

function buildReplayMetaRows(hand) {
  var replay = hand.replay || {};
  var rows = [];
  if (replay.heroPosition || replay.villainPosition) {
    rows.push({
      label: 'Positions',
      value: [replay.heroPosition ? 'Hero: ' + replay.heroPosition : '', replay.villainPosition ? 'Key opponent: ' + replay.villainPosition : ''].filter(Boolean).join(' · ')
    });
  }
  if (replay.stacks) rows.push({ label: 'Stacks / Blinds', value: replay.stacks });
  if (replay.board) rows.push({ label: 'Board Runout', value: replay.board });
  return rows;
}

function buildReplayStreetRows(hand) {
  var replay = hand.replay || {};
  return [
    { label: 'Preflop', value: replay.preflop || '' },
    { label: 'Flop', value: replay.flop || '' },
    { label: 'Turn', value: replay.turn || '' },
    { label: 'River', value: replay.river || '' }
  ].filter(function(item) { return item.value; });
}

function buildHandReplayHtml(hand) {
  var linkedSession = hand.sessionId ? sessions.find(function(s) { return s.id === hand.sessionId; }) : null;
  var sessionLabel = linkedSession ? linkedSession.name + ' — ' + linkedSession.date : (hand.session || 'Unlinked hand');
  var resultMeta = getHandResultMeta(hand.result);
  var metaRows = buildReplayMetaRows(hand);
  var streetRows = buildReplayStreetRows(hand);
  var html = '';

  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap;margin-bottom:1rem">';
  html += '<div><div style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:.25rem">Linked Session</div><div style="font-size:14px;color:#fff;line-height:1.5">' + esc(sessionLabel) + '</div></div>';
  html += '<div style="font-family:var(--mono);font-size:10px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.28);color:' + resultMeta.color + ';border:1px solid var(--rim2)">' + resultMeta.label + '</div>';
  html += '</div>';

  if (metaRows.length) {
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.65rem;margin-bottom:1rem">';
    metaRows.forEach(function(row) {
      html += '<div style="background:var(--bg3);border-radius:10px;padding:.8rem .9rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:.35rem">' + row.label + '</div><div style="font-size:13px;color:#fff;line-height:1.6">' + esc(row.value) + '</div></div>';
    });
    html += '</div>';
  }

  if (!streetRows.length) {
    html += '<div style="background:rgba(255,255,255,.03);border:1px solid var(--rim);border-radius:12px;padding:.9rem 1rem;margin-bottom:1rem;font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.45)">Replay details were not captured for this hand. Summary and lesson are still available below.</div>';
  } else {
    html += '<div style="display:grid;gap:.75rem;margin-bottom:1rem">';
    streetRows.forEach(function(row) {
      html += '<div style="background:var(--bg3);border-radius:12px;padding:.9rem 1rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.12em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:.4rem">' + row.label + '</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.7">' + toMultilineHtml(row.value) + '</div></div>';
    });
    html += '</div>';
  }

  if (hand.desc) {
    html += '<div style="background:var(--bg3);border-radius:12px;padding:.9rem 1rem;margin-bottom:1rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.12em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:.4rem">Summary</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.7">' + toMultilineHtml(hand.desc) + '</div></div>';
  }
  if (hand.lesson) {
    html += '<div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);border-radius:12px;padding:.9rem 1rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.12em;color:var(--gold);text-transform:uppercase;margin-bottom:.35rem">Lesson / Note</div><div style="font-size:13px;color:#fff;line-height:1.7">' + toMultilineHtml(hand.lesson) + '</div></div>';
  }
  if (!hand.desc && !hand.lesson) {
    html += '<div style="background:rgba(255,255,255,.03);border:1px solid var(--rim);border-radius:12px;padding:.9rem 1rem;font-family:var(--mono);font-size:11px;color:rgba(255,255,255,.45)">No extra note was saved for this hand.</div>';
  }
  return html;
}

function openHandReplay(id) {
  var hand = hands.find(function(item) { return item.id === id; });
  if (!hand) return;
  var titleEl = document.getElementById('hr-title');
  var bodyEl = document.getElementById('hr-body');
  if (!titleEl || !bodyEl) return;
  titleEl.textContent = hand.title || 'Hand Replay';
  bodyEl.innerHTML = buildHandReplayHtml(hand);
  openModal('modal-hand-replay');
}

function resetHandReplayFields(prefix) {
  [
    prefix + 'hero-pos',
    prefix + 'villain-pos',
    prefix + 'stacks',
    prefix + 'board',
    prefix + 'preflop',
    prefix + 'flop',
    prefix + 'turn',
    prefix + 'river'
  ].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function prepareNewHandForm(context) {
  _editingHandId = null;
  setHandModalTitle('Log Notable Hand');
  var opts = context || {};
  var sessionLinkEl = document.getElementById('h-session-link');
  var sessionLabelEl = document.getElementById('h-session');
  var pendingKeyEl = document.getElementById('h-pending-session-key');
  var resultEl = document.getElementById('h-result');
  var titleEl = document.getElementById('h-title');
  var descEl = document.getElementById('h-desc');
  var lessonEl = document.getElementById('h-lesson');

  if (titleEl) titleEl.value = '';
  if (descEl) descEl.value = '';
  if (lessonEl) lessonEl.value = '';
  if (resultEl) resultEl.value = opts.result || 'lost';
  resetHandReplayFields('h-');

  if (sessionLinkEl) sessionLinkEl.value = opts.sessionId ? String(opts.sessionId) : '';
  if (sessionLabelEl) sessionLabelEl.value = opts.sessionLabel || '';
  if (pendingKeyEl) pendingKeyEl.value = opts.pendingSessionKey || '';
}

function openNewHandModal() {
  prepareNewHandForm({
    sessionId: 0,
    sessionLabel: '',
    pendingSessionKey: '',
    result: 'lost'
  });
  openModal('modal-hand');
}

function addHand() {
  var sessionLink = document.getElementById('h-session-link');
  var sessionId = sessionLink ? parseInt(sessionLink.value, 10) || 0 : 0;
  var pendingKeyEl = document.getElementById('h-pending-session-key');
  var pendingKey = pendingKeyEl ? pendingKeyEl.value || '' : '';
  var sessionLabel = '';
  if (sessionId) {
    var linked = sessions.find(function(s) { return s.id === sessionId; });
    if (linked) sessionLabel = linked.name + ' — ' + linked.date;
  }
  if (_editingHandId) {
    var existing = hands.find(function(x) { return x.id === _editingHandId; });
    if (!existing) { _editingHandId = null; return; }
    existing.sessionId = sessionId;
    existing.session = sessionLabel || document.getElementById('h-session').value || existing.session;
    existing.pendingSessionKey = sessionId ? '' : (pendingKeyEl ? pendingKeyEl.value || '' : '');
    existing.title = document.getElementById('h-title').value || 'Hand';
    existing.desc = document.getElementById('h-desc').value || '';
    existing.lesson = document.getElementById('h-lesson').value || '';
    existing.result = document.getElementById('h-result').value;
    var editedReplay = collectReplayFields('h-');
    if (editedReplay) existing.replay = editedReplay;
    else delete existing.replay;
    save('hands', hands);
    _editingHandId = null;
    setHandModalTitle('Log Notable Hand');
    closeModal('modal-hand');
    populateSessionDropdowns();
    renderHands();
    renderActiveSessionSurface();
    return;
  }
  var h = {
    id: Date.now(),
    sessionId: sessionId,
    session: sessionLabel || document.getElementById('h-session').value || new Date().toLocaleDateString(),
    title: document.getElementById('h-title').value || 'Hand',
    desc: document.getElementById('h-desc').value || '',
    lesson: document.getElementById('h-lesson').value || '',
    result: document.getElementById('h-result').value,
    pendingSessionKey: sessionId ? '' : pendingKey
  };
  var replay = collectReplayFields('h-');
  if (replay) h.replay = replay;
  window.hands.unshift(h);
  hands = window.hands;
  save('hands', hands);
  closeModal('modal-hand');
  if (pendingKeyEl) pendingKeyEl.value = '';
  populateSessionDropdowns();
  renderHands();
  renderActiveSessionSurface();
}

function deleteHand(id) {
  hands = hands.filter(function(x) { return x.id !== id; });
  save('hands', hands);
  renderHands();
}

function renderHands() {
  var el = document.getElementById('hand-list');
  if (!el) return;
  var filterEl = document.getElementById('hand-session-filter');
  var filterVal = filterEl ? parseInt(filterEl.value, 10) || 0 : 0;
  var filtered = filterVal ? hands.filter(function(h) { return h.sessionId === filterVal; }) : hands;
  var countEl = document.getElementById('hand-count');
  if (countEl) countEl.textContent = filtered.length + ' hand' + (filtered.length !== 1 ? 's' : '');
  if (!filtered.length) {
    el.innerHTML = '<div style="padding:3rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">' + (filterVal ? 'No hands linked to this session yet.' : 'No hands logged yet. Capture a hand manually or turn a voice memo into a structured review.') + '</div>';
    return;
  }
  el.innerHTML = filtered.map(function(h) {
    var resultMeta = getHandResultMeta(h.result);
    var linkedSession = h.sessionId ? sessions.find(function(s) { return s.id === h.sessionId; }) : null;
    var sessionBadge = linkedSession ? '<span style="font-family:var(--mono);font-size:9px;background:var(--gold-dim);color:var(--gold);border:1px solid rgba(201,168,76,.25);border-radius:20px;padding:2px 7px;margin-left:.4rem">' + esc(linkedSession.name) + '</span>' : '';
    return '<div class="hand-card"><div class="hand-top"><div style="flex:1"><div class="hand-meta">' + esc(h.session) + sessionBadge + '</div><div class="hand-title">' + esc(h.title) + '</div></div><div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;justify-content:flex-end"><button class="sec-action" style="padding:.32rem .7rem;font-size:10px" onclick="event.stopPropagation();editHand(' + h.id + ')">EDIT</button><button class="sec-action" style="padding:.32rem .7rem;font-size:10px" onclick="event.stopPropagation();openHandReplay(' + h.id + ')">REPLAY</button><span class="hand-result ' + resultMeta.className + '">' + resultMeta.label + '</span><button class="del-btn" onclick="event.stopPropagation();deleteHand(' + h.id + ')">✕</button></div></div>' + (h.desc ? '<div class="hand-body">' + esc(h.desc) + '</div>' : '') + (h.lesson ? '<div style="margin-top:.6rem;font-size:11px;color:var(--gold);font-family:var(--mono)">💡 ' + esc(h.lesson) + '</div>' : '') + '</div>';
  }).join('');
}

var ANTHROPIC_KEY_LOCAL_STORAGE = 'pokerhq_anthropic_key';

function getStoredAnthropicKey() {
  var fromStore = typeof loadLocalOnly === 'function' ? loadLocalOnly(ANTHROPIC_KEY_LOCAL_STORAGE, '') : '';
  if (fromStore) return fromStore;
  var cfg = window.PokerHQAI || window.pokerhqAI || {};
  return cfg.apiKey || cfg.anthropicApiKey || '';
}

function setStoredAnthropicKey(key) {
  if (typeof saveLocalOnly === 'function') saveLocalOnly(ANTHROPIC_KEY_LOCAL_STORAGE, key || null);
}

function refreshVoiceKeyRow() {
  var input = document.getElementById('voice-api-key');
  var tip = document.getElementById('voice-key-tip');
  if (!input) return;
  var hasKey = !!getStoredAnthropicKey();
  input.placeholder = hasKey ? 'Key saved on this device — paste a new key to replace' : 'sk-ant-...';
  if (tip) tip.textContent = hasKey
    ? "A key is saved in this device's local storage only — never synced. Paste a new one to replace it."
    : "Stored only in this device's local storage — never synced. Create a key at console.anthropic.com.";
}

function resolveVoiceApiKey() {
  var input = document.getElementById('voice-api-key');
  var typed = input ? input.value.trim() : '';
  if (typed) {
    setStoredAnthropicKey(typed);
    if (input) input.value = '';
    refreshVoiceKeyRow();
    return typed;
  }
  return getStoredAnthropicKey();
}

function clearVoiceModal() {
  document.getElementById('voice-transcript').value = '';
  document.getElementById('voice-result').style.display = 'none';
  document.getElementById('voice-save-btn').style.display = 'none';
  document.getElementById('voice-structure-btn').style.display = 'inline-flex';
  document.getElementById('voice-error').style.display = 'none';
  document.getElementById('voice-loading').style.display = 'none';
  refreshVoiceKeyRow();
}

async function structureHand() {
  var transcript = document.getElementById('voice-transcript').value.trim();
  if (!transcript) {
    alert('Paste a voice transcript first.');
    return;
  }

  var errEl = document.getElementById('voice-error');
  var apiKey = resolveVoiceApiKey();
  if (!apiKey) {
    errEl.textContent = 'Add your Anthropic API key above first — it stays on this device only.';
    errEl.style.display = 'block';
    var keyInput = document.getElementById('voice-api-key');
    if (keyInput) keyInput.focus();
    return;
  }

  document.getElementById('voice-loading').style.display = 'block';
  document.getElementById('voice-structure-btn').style.display = 'none';
  errEl.style.display = 'none';
  document.getElementById('voice-result').style.display = 'none';

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: 'You are a poker hand log structurer. Convert this voice transcript into a structured poker hand log. Respond ONLY with valid JSON, no other text. Use this exact format: {"result":"won|lost|fold","title":"concise 8-10 word hand situation","desc":"full hand description with positions actions board and reasoning","lesson":"one specific lesson from this hand"} Transcript: ' + transcript
        }]
      })
    });
    if (!response.ok) {
      if (response.status === 401) {
        setStoredAnthropicKey(null);
        refreshVoiceKeyRow();
        throw new Error('API key was rejected (401) — paste a valid key and try again');
      }
      throw new Error('Claude API error (' + response.status + ')');
    }
    var data = await response.json();
    var text = (data.content || []).map(function(c) { return c.text || ''; }).join('');
    var js = text.indexOf('{'), je = text.lastIndexOf('}');
    var parsed = JSON.parse(text.substring(js, je + 1));

    document.getElementById('vr-result').value = parsed.result || 'lost';
    document.getElementById('vr-title').value = parsed.title || '';
    document.getElementById('vr-desc').value = parsed.desc || '';
    document.getElementById('vr-lesson').value = parsed.lesson || '';
    document.getElementById('voice-result').style.display = 'block';
    document.getElementById('voice-save-btn').style.display = 'inline-flex';
  } catch (e) {
    errEl.textContent = 'Could not structure hand: ' + e.message + '. Try again or log manually.';
    errEl.style.display = 'block';
    document.getElementById('voice-structure-btn').style.display = 'inline-flex';
  }
  document.getElementById('voice-loading').style.display = 'none';
}

function saveVoiceHand() {
  var sessionLink = document.getElementById('voice-session-link');
  var sessionId = sessionLink ? parseInt(sessionLink.value, 10) || 0 : 0;
  var sessionLabel = '';
  var pendingKey = '';
  if (sessionId) {
    var linked = sessions.find(function(s) { return s.id === sessionId; });
    if (linked) sessionLabel = linked.name + ' — ' + linked.date;
  } else if (_activeSessionDraft && _activeSessionDraft.key) {
    pendingKey = _activeSessionDraft.key;
    sessionLabel = getActiveSessionLabel() || new Date().toLocaleDateString('en-PH');
  }
  var h = {
    id: Date.now(),
    sessionId: sessionId,
    session: sessionLabel || new Date().toLocaleDateString('en-PH'),
    title: document.getElementById('vr-title').value || 'Hand',
    desc: document.getElementById('vr-desc').value || '',
    lesson: document.getElementById('vr-lesson').value || '',
    result: document.getElementById('vr-result').value,
    source: 'voice',
    pendingSessionKey: sessionId ? '' : pendingKey
  };
  window.hands.unshift(h);
  hands = window.hands;
  save('hands', hands);
  closeModal('modal-voice');
  clearVoiceModal();
  populateSessionDropdowns();
  renderHands();
  renderActiveSessionSurface();
}
