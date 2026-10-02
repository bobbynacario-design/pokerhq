// Review Inbox: the page (REVIEW → Inbox), the small card on Home, and the count badges.
// The rules for what is in it live in js/data/inbox.js (window.PokerHQInbox).

var _inbox = { items: [], total: 0, byKind: {} };
var _inboxTimer = null;
var _inboxLastHomeLimit = 3;

// Venues you still play: sessions in the last 120 days and events coming up in the next 30.
function inboxRecentVenues() {
  var venues = [];
  var now = Date.now();
  (window.sessions || []).forEach(function(s) {
    if (!s || !s.venue || !/^\d{4}-\d{2}-\d{2}/.test(s.date || '')) return;
    var d = new Date(s.date.slice(0, 10) + 'T12:00:00').getTime();
    if (!isNaN(d) && now - d <= 120 * 86400000) venues.push(s.venue);
  });
  (window.tourneys || []).forEach(function(t) {
    if (!t || !t.venue || typeof parseTourneyDateRange !== 'function') return;
    var r = parseTourneyDateRange(t);
    if (r && r.end && r.end.getTime() >= now - 86400000 && r.start.getTime() <= now + 30 * 86400000) venues.push(t.venue);
  });
  return venues;
}

function computeInbox() {
  var I = window.PokerHQInbox;
  if (!I) return { items: [], total: 0, byKind: {} };
  return I.build({
    now: Date.now(),
    sessions: window.sessions || [],
    hands: window.hands || [],
    opponents: window.opponents || [],
    savedDrills: typeof window.drillSavedList === 'function' ? window.drillSavedList() : [],
    dismissedLeaks: (window.reviewState && window.reviewState.dismissedLeaks) || {},
    recentVenues: inboxRecentVenues()
  });
}

function inboxRowHtml(item, compact) {
  var I = window.PokerHQInbox;
  var kind = I.KINDS[item.kind];
  var key = esc(item.key);
  var reviewLabel = item.action === 'finish' ? 'FINISH ↗' : item.kind === 'drill' ? 'OPEN ↗' : 'REVIEW ↗';
  return '<div class="inbox-row' + (compact ? ' compact' : '') + '" data-key="' + key + '">' +
    '<div class="inbox-main"><div class="inbox-title"><span class="inbox-icon" aria-hidden="true">' + kind.icon + '</span> ' + esc(item.title) + '</div>' +
    '<div class="inbox-detail">' + esc(item.detail) + '</div></div>' +
    '<div class="inbox-actions"><button class="sec-action primary" onclick="inboxReview(\'' + key + '\')">' + reviewLabel + '</button>' +
    (item.kind === 'leak' ? '<button class="sec-action" onclick="openPracticeFromLeak(\'' + key + '\')">CREATE PRACTICE DRILL</button>' : '') +
    '<button class="sec-action" onclick="inboxResolve(\'' + key + '\')" title="Clear this from your inbox">MARK RESOLVED</button></div></div>';
}

function renderInbox() {
  var el = document.getElementById('inbox-list');
  if (!el || !window.PokerHQInbox) return;
  var I = window.PokerHQInbox;
  if (!_inbox.total) {
    el.innerHTML = '<div class="inbox-empty"><div class="inbox-empty-title">✓ Inbox clear</div>' +
      '<div class="inbox-empty-copy">Nothing is waiting for a second look. Things show up here when you mark a hand to review later, log a hand without its details, finish a session without a debrief, keep a lesson from a hand, let a villain note go stale, or save a Daily Drill.</div></div>';
    return;
  }
  el.innerHTML = I.KIND_ORDER.map(function(kind) {
    var rows = _inbox.items.filter(function(i) { return i.kind === kind; });
    if (!rows.length) return '';
    return '<section class="inbox-group" aria-label="' + esc(I.KINDS[kind].label) + '"><h3 class="inbox-group-title"><span aria-hidden="true">' + I.KINDS[kind].icon + '</span> ' + esc(I.KINDS[kind].label) + ' <span class="inbox-count">' + rows.length + '</span></h3>' +
      rows.map(function(i) { return inboxRowHtml(i, false); }).join('') + '</section>';
  }).join('');
}

function renderInboxHomeCard() {
  var el = document.getElementById('inbox-home-wrap');
  if (!el) return;
  if (!_inbox.total) { el.innerHTML = ''; return; }
  var shown = _inbox.items.slice(0, _inboxLastHomeLimit);
  var more = _inbox.total - shown.length;
  el.innerHTML = '<div class="form-card inbox-card"><div class="inbox-card-top"><div class="inbox-card-title"><span aria-hidden="true">📥</span> Review Inbox <span class="inbox-count">' + _inbox.total + '</span></div>' +
    '<button class="sec-action" onclick="switchGroup(\'review\',\'inbox\')">OPEN INBOX' + (more > 0 ? ' · ' + more + ' more' : '') + ' ↗</button></div>' +
    shown.map(function(i) { return inboxRowHtml(i, true); }).join('') + '</div>';
}

function renderInboxBadges() {
  document.querySelectorAll('.inbox-badge').forEach(function(b) {
    b.textContent = _inbox.total > 99 ? '99+' : String(_inbox.total);
    b.style.display = _inbox.total ? '' : 'none';
    b.setAttribute('aria-label', _inbox.total + ' items in your review inbox');
  });
}

// Recompute and redraw everything that shows the inbox. Called after any change, coalesced.
function refreshInbox() {
  clearTimeout(_inboxTimer);
  _inboxTimer = setTimeout(refreshInboxNow, 0);
}

function refreshInboxNow() {
  _inbox = computeInbox();
  renderInboxHomeCard();
  renderInboxBadges();
  var page = document.getElementById('page-inbox');
  if (page && page.classList.contains('active')) renderInbox();
}

function inboxItem(key) {
  return _inbox.items.filter(function(i) { return i.key === key; })[0] || null;
}

function inboxReview(key) {
  var item = inboxItem(key);
  if (!item) return;
  if (item.kind === 'session') viewSessionDetail(item.ref);
  else if (item.kind === 'hand' || item.kind === 'lesson') { if (item.action === 'finish') editHand(item.ref); else openHandReplay(item.ref); }
  else if (item.kind === 'opponent') editOpponent(item.ref);
  else if (item.kind === 'leak') {
    switchGroup('review', 'hands');
    setTimeout(function() {
      var tag = String(item.ref || '').replace(/^tag:/, '');
      if (typeof window.setHandTagFilter === 'function') window.setHandTagFilter(tag);
    }, 0);
  }
  else if (item.kind === 'drill' && typeof window.drillOpenSaved === 'function') window.drillOpenSaved(item.ref);
}

var INBOX_LISTS = { session: 'sessions', hand: 'hands', lesson: 'hands', opponent: 'opponents' };

function inboxRecord(kind, ref) {
  var list = kind === 'session' ? window.sessions : kind === 'opponent' ? window.opponents : window.hands;
  return (list || []).filter(function(r) { return r && r.id === ref; })[0] || null;
}

function inboxResolve(key) {
  var item = inboxItem(key);
  var I = window.PokerHQInbox;
  if (!item || !I) return;
  var label = 'Resolved: ' + (item.title.length > 40 ? item.title.slice(0, 39) + '…' : item.title);
  if (item.kind === 'drill') {
    if (typeof window.drillUnsave === 'function') window.drillUnsave(item.ref);
    if (typeof showUndoToast === 'function') showUndoToast(label, function() { window.drillResave(item.ref); refreshInboxNow(); }, 6000);
    refreshInboxNow();
    return;
  }
  if (item.kind === 'leak') {
    window.reviewState = window.reviewState || { dismissedLeaks: {} };
    window.reviewState.dismissedLeaks = window.reviewState.dismissedLeaks || {};
    window.reviewState.dismissedLeaks[item.ref] = Date.now();
    save('reviewState', window.reviewState);
    refreshInboxNow();
    return;
  }
  var rec = inboxRecord(item.kind, item.ref);
  if (!rec) return;
  var listKey = INBOX_LISTS[item.kind];
  var prev = I.resolve(item.kind, rec, Date.now());
  save(listKey, window[listKey]);
  if (typeof showUndoToast === 'function') {
    showUndoToast(label, function() {
      // look the record up again: a sync in between replaces the list with fresh copies of every record
      var current = inboxRecord(item.kind, item.ref);
      if (current) { I.undo(current, prev); save(listKey, window[listKey]); }
      refreshInboxNow();
    }, 6000);
  }
  refreshInboxNow();
}

// "Debrief done" on a session: the same flag the inbox uses, set from the session detail.
function markSessionDebriefed(sid) {
  var s = (window.sessions || []).filter(function(x) { return x.id === sid; })[0];
  if (!s || !window.PokerHQInbox) return;
  if (s.debriefedAt) { delete s.debriefedAt; } else { s.debriefedAt = Date.now(); }
  save('sessions', window.sessions);
  refreshInboxNow();
  var btn = document.getElementById('sd-debriefed-btn');
  if (btn) { btn.textContent = s.debriefedAt ? '✓ DEBRIEF DONE · UNDO' : 'MARK DEBRIEF DONE'; btn.classList.toggle('done', !!s.debriefedAt); }
}
