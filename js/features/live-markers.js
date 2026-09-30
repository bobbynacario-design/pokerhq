// Live hand markers (buttons, Hand History tag bar, tags on the hand form).
// The rules live in js/data/markers.js (window.PokerHQMarkers).

var _lastMarkerTap = { kind: '', at: 0 };
var _handTagFilter = '';       // '' = all, 'unfinished', or a tag id
var _handFormTags = [];        // tags picked in the open hand form

// How far into the session we are: the running timer, or the paused one. null before any timer.
function liveElapsedMs() {
  if (typeof _timerInterval !== 'undefined' && _timerInterval && _timerStart) return Date.now() - _timerStart;
  if (typeof _timerElapsed !== 'undefined' && _timerElapsed > 0) return _timerElapsed;
  return null;
}

function markerClockLabel(at) {
  try { return new Date(at).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; }
}

function describeHandMarker(h) {
  var M = window.PokerHQMarkers;
  return M && h && h.marker ? M.describeMarker(h, markerClockLabel(h.marker.at)) : '';
}

// The six big buttons, the optional stack / level, and the last few markers of this session.
// Rendered inside the active-session card (Home and Play), so nothing here uses an element id.
function liveMarkersHtml() {
  var M = window.PokerHQMarkers;
  if (!M) return '';
  var d = _activeSessionDraft || {};
  var buttons = M.KINDS.map(function(k) {
    return '<button class="lm-btn lm-' + k.id + '" data-kind="' + k.id + '" onclick="addLiveMarker(\'' + k.id + '\')" aria-label="Mark: ' + esc(k.label) + '. ' + esc(k.hint) + '">' +
      '<span class="lm-icon" aria-hidden="true">' + k.icon + '</span><span class="lm-label">' + esc(k.label) + '</span></button>';
  }).join('');
  var recent = d.key ? hands.filter(function(h) { return h.marker && h.pendingSessionKey === d.key; }).sort(function(a, b) { return b.marker.at - a.marker.at; }).slice(0, 3) : [];
  var recentHtml = recent.length
    ? '<div class="lm-recent">' + recent.map(function(h) {
        var kind = M.kindById(h.marker.kind);
        return '<div class="lm-recent-row"><span class="lm-recent-text"><span aria-hidden="true">' + (kind ? kind.icon : '') + '</span> ' + esc(describeHandMarker(h)) + (M.isFinished(h) ? ' <span class="lm-done">✓ finished</span>' : '') + '</span>' +
          '<button class="sec-action" onclick="editHand(' + h.id + ')">' + (M.isFinished(h) ? 'EDIT' : 'FINISH ↗') + '</button></div>';
      }).join('') + '</div>'
    : '';
  return '<div class="live-markers"><div class="quick-panel-title">Mark this hand · one tap</div>' +
    '<div class="lm-sub">Saved to Hand History with the time. Fill in the details after the hand.</div>' +
    '<div class="lm-grid">' + buttons + '</div>' +
    '<div class="lm-context">' +
      '<label>Stack <input type="text" inputmode="decimal" data-lm="stack" maxlength="24" placeholder="e.g. 24 (bb)" value="' + esc(d.liveStack || '') + '" oninput="setLiveMarkerContext(\'stack\', this.value)" aria-label="Your current stack in big blinds, optional"></label>' +
      '<label>Level <input type="text" data-lm="level" maxlength="24" placeholder="e.g. L12 800/1600" value="' + esc(d.liveLevel || '') + '" oninput="setLiveMarkerContext(\'level\', this.value)" aria-label="Blind level, optional"></label>' +
    '</div>' + recentHtml + '</div>';
}

// Typing here must not redraw the card (that would drop the keyboard), so it saves the draft quietly
// and copies the text into the other copy of the card (Home and Play both show one).
function setLiveMarkerContext(field, value) {
  if (!_activeSessionDraft) return;
  if (field === 'stack') _activeSessionDraft.liveStack = value;
  else _activeSessionDraft.liveLevel = value;
  saveScopedUiJson(ACTIVE_SESSION_DRAFT_STORAGE_KEY, _activeSessionDraft);
  document.querySelectorAll('[data-lm="' + field + '"]').forEach(function(el) { if (el.value !== value) el.value = value; });
}

function addLiveMarker(kind) {
  var M = window.PokerHQMarkers;
  if (!M || !M.isKind(kind)) return;
  var now = Date.now();
  if (M.shouldIgnoreTap(_lastMarkerTap.kind, _lastMarkerTap.at, kind, now)) return;
  _lastMarkerTap = { kind: kind, at: now };
  if (!_activeSessionDraft) ensureActiveSessionDraft({ date: todayLocal() });
  var d = _activeSessionDraft;
  var h = M.buildMarker({
    kind: kind,
    now: now,
    elapsedMs: liveElapsedMs(),
    stack: d.liveStack,
    level: d.liveLevel,
    sessionLabel: getActiveSessionLabel() || 'Active session',
    pendingSessionKey: d.key || '',
    existingIds: hands.map(function(x) { return x.id; })
  });
  if (!h) return;
  window.hands.unshift(h);
  hands = window.hands;
  save('hands', hands);
  if (typeof renderHands === 'function') renderHands();
  renderActiveSessionSurface();
  document.querySelectorAll('.lm-btn[data-kind="' + kind + '"]').forEach(function(b) { b.classList.add('lm-flash'); });
  try { if (navigator.vibrate) navigator.vibrate(25); } catch (e) {}
  if (typeof showUndoToast === 'function') {
    showUndoToast('Marked: ' + M.describeMarker(h, markerClockLabel(now)), function() { undoLiveMarker(h.id); }, 5000);
  }
}

function undoLiveMarker(id) {
  var idx = hands.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  hands.splice(idx, 1);
  window.hands = hands;
  save('hands', hands);
  if (typeof renderHands === 'function') renderHands();
  renderActiveSessionSurface();
}

// ── Hand History: tag chips on each hand, and the filter bar above the list ──
function handTagChipsHtml(h) {
  var M = window.PokerHQMarkers;
  if (!M) return '';
  var chips = M.handTags(h).map(function(id) {
    var k = M.kindById(id);
    return '<span class="lm-chip lm-chip-' + id + '"><span aria-hidden="true">' + k.icon + '</span> ' + esc(k.label) + '</span>';
  }).join('');
  return chips ? '<div class="lm-chips">' + chips + '</div>' : '';
}

function handMarkerMetaHtml(h) {
  var text = describeHandMarker(h);
  return text ? '<div class="lm-meta">⏱ ' + esc(text) + (h.needsDetails ? ' · <strong>needs details</strong>' : '') + '</div>' : '';
}

function renderHandTagBar(handsInScope) {
  var el = document.getElementById('hand-tag-bar');
  var M = window.PokerHQMarkers;
  if (!el || !M) return;
  var s = M.tagSummary(handsInScope);
  var used = s.counts.filter(function(c) { return c.count > 0; });
  if (!used.length && !s.unfinished) { el.innerHTML = ''; return; }
  function chip(tag, label, count, extra) {
    var on = _handTagFilter === tag;
    return '<button class="lm-filter' + (on ? ' on' : '') + (extra || '') + '" aria-pressed="' + on + '" onclick="setHandTagFilter(\'' + tag + '\')">' + label + ' <span class="lm-count">' + count + '</span></button>';
  }
  el.innerHTML = '<div class="lm-filterbar" role="group" aria-label="Filter hands by tag">' +
    chip('', 'All', s.total) +
    (s.unfinished ? chip('unfinished', 'Needs details', s.unfinished, ' lm-filter-warn') : '') +
    used.map(function(c) { return chip(c.id, '<span aria-hidden="true">' + c.icon + '</span> ' + esc(c.label), c.count); }).join('') +
    '</div>';
}

function setHandTagFilter(tag) {
  _handTagFilter = _handTagFilter === tag ? '' : tag;
  renderHands();
}

// ── the tags on the hand form ──
function renderHandFormTags() {
  var el = document.getElementById('h-tags');
  var M = window.PokerHQMarkers;
  if (!el || !M) return;
  el.innerHTML = M.KINDS.map(function(k) {
    var on = _handFormTags.indexOf(k.id) !== -1;
    return '<button type="button" class="lm-chip lm-chip-pick lm-chip-' + k.id + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="toggleHandFormTag(\'' + k.id + '\')"><span aria-hidden="true">' + k.icon + '</span> ' + esc(k.label) + '</button>';
  }).join('');
}

function setHandFormTags(tags) {
  _handFormTags = window.PokerHQMarkers ? window.PokerHQMarkers.handTags({ tags: tags || [] }) : [];
  renderHandFormTags();
}

function toggleHandFormTag(id) {
  if (!window.PokerHQMarkers) return;
  _handFormTags = window.PokerHQMarkers.toggleTag(_handFormTags, id);
  renderHandFormTags();
}

// "Marked at 42:10 in · 24bb: add what happened, then save." shown above the form while finishing a marker
function setHandMarkerNote(h) {
  var el = document.getElementById('h-marker-note');
  if (!el) return;
  var text = h ? describeHandMarker(h) : '';
  if (text && h.needsDetails) { el.textContent = 'Marked: ' + text + '. Add what happened, then save to finish it.'; el.style.display = ''; }
  else if (text) { el.textContent = 'Marked: ' + text; el.style.display = ''; }
  else { el.textContent = ''; el.style.display = 'none'; }
}
