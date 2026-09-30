var _reentryPending = null;
var _reentrySettingsOpen = false;
var _reentrySettingsKey = '';

function reentrySnapshot() {
  return PokerHQPlayerPlanning.reentry(window.tourneys,window.sessions,_activeSessionDraft,{bankroll:window.bankroll && window.bankroll.amount,today:todayLocal(),parse:parseTourneyDateRange});
}

function reentryFingerprint(s) { return JSON.stringify([_activeSessionDraft.key,_activeSessionDraft.bullets,s]); }

function reentryGuardDisplay() {
  var s = reentrySnapshot(), html = '<div class="guard-display" role="status" aria-live="polite">';
  if (s.missingBuyin) return html+'<p>Set the session buy-in to preview your next bullet.</p></div>';
  html += '<div class="guard-preview"><strong>Next bullet '+fmtCur(s.next)+'</strong><span>Entry spend '+fmtCur(s.current)+' → '+fmtCur(s.current+s.next)+'</span></div>';
  html += '<p>'+fmtCur(s.reserved)+' protected for '+s.pinnedCount+' upcoming event'+(s.pinnedCount!==1?'s':'')+(s.protect ? ' · '+fmtCur(s.protect)+' other funds' : '')+'.</p>';
  html += '<p class="'+(s.remaining<0 ? 'guard-warning' : '')+'">'+(s.remaining<0 ? 'Shortfall after next bullet: '+fmtCur(-s.remaining)+'.' : (s.unknown ? 'After known commitments, bankroll' : 'Bankroll')+' left after next bullet: '+fmtCur(s.remaining)+'.')+'</p>';
  if (s.capOver) html += '<p class="guard-warning">Another bullet exceeds your '+fmtCur(s.cap)+' session cap by '+fmtCur(s.current+s.next-s.cap)+'.</p>';
  if (s.unknown) html += '<p class="guard-warning">'+s.unknown+' pinned event'+(s.unknown!==1?'s have':' has')+' no buy-in amount. Fill it in to complete this estimate.</p>';
  if (s.invalid) html += '<p class="guard-warning">Enter zero or positive amounts in Re-entry settings.</p>';
  if (_reentryPending === reentryFingerprint(s)) html += '<div class="guard-review" role="alert"><p>Review the budget above before recording another bullet.</p><div class="surface-actions"><button class="sec-action guard-continue" onclick="updateBulletCount(1,true)">ADD BULLET ANYWAY</button><button class="sec-action" onclick="cancelReentryReview()">CANCEL</button></div></div>';
  html += '<p class="guard-footnote">Projection includes entry spend and protected funds.</p></div>';
  return html;
}

function reentryGuardHtml(isPlay) {
  if (!_activeSessionDraft) return '';
  if (_reentrySettingsKey !== _activeSessionDraft.key) { _reentrySettingsKey = _activeSessionDraft.key; _reentrySettingsOpen = false; }
  var previous = document.querySelector('#play-active-session-wrap .reentry-settings');
  if (isPlay && previous && previous.dataset.draft === _activeSessionDraft.key) _reentrySettingsOpen = previous.open;
  var g = _activeSessionDraft.reentryGuard || {}, html = '<div class="reentry-guard"><div class="quick-panel-title">Re-entry guard</div>'+reentryGuardDisplay();
  if (isPlay) html += '<details class="reentry-settings" data-draft="'+esc(_activeSessionDraft.key)+'"'+(_reentrySettingsOpen?' open':'')+'><summary>Re-entry settings</summary><div class="form-grid">'+[
    ['nextCost','Next bullet cost (₱)',_activeSessionDraft.buyin || 'Same as buy-in'],['cap','Session spending cap (₱)','Optional'],['protect','Other funds to protect (₱)','Travel, hotel or savings']
  ].map(function(f) { return '<div class="form-group"><label class="form-label" for="guard-play-'+f[0]+'">'+f[1]+'</label><input class="form-input" id="guard-play-'+f[0]+'" type="number" data-money min="0" value="'+(g[f[0]]==null?'':g[f[0]])+'" placeholder="'+esc(f[2])+'" oninput="setReentryGuardField(\''+f[0]+'\',this.value)"></div>'; }).join('')+'</div><p class="guard-footnote">Settings stay with this session. Pinned buy-ins are protected automatically across locations.</p></details>';
  return html+'</div>';
}

function refreshReentryGuard() {
  document.querySelectorAll('.reentry-guard .guard-display').forEach(function(el) { el.outerHTML = reentryGuardDisplay(); });
}

function setReentryGuardField(field,value) {
  if (!_activeSessionDraft || ['nextCost','cap','protect'].indexOf(field)<0) return;
  var g = _activeSessionDraft.reentryGuard || (_activeSessionDraft.reentryGuard = {});
  if (value==='') delete g[field]; else g[field] = Number(value);
  _reentryPending = null;
  saveScopedUiJson(ACTIVE_SESSION_DRAFT_STORAGE_KEY,_activeSessionDraft);
  refreshReentryGuard();
}

function cancelReentryReview() { _reentryPending = null; refreshReentryGuard(); }

function changeReentryBullet(delta,reviewed) {
  if (delta!==1 && delta!==-1) return false;
  var s = reentrySnapshot(), count = Math.max(1,Number(_activeSessionDraft.bullets)||1);
  if (delta>0 && s.invalid) { refreshReentryGuard(); return false; }
  if (delta>0 && !s.missingBuyin && s.review && (!reviewed || _reentryPending!==reentryFingerprint(s))) {
    _reentryPending = reentryFingerprint(s);
    renderActiveSessionSurface();
    var action = document.querySelector('.page.active .guard-continue');
    if (action) action.focus();
    return false;
  }
  _reentryPending = null;
  var g = _activeSessionDraft.reentryGuard || (_activeSessionDraft.reentryGuard = {}), costs = s.costs.slice();
  if (delta>0) { costs.push(s.next); _activeSessionDraft.rebuy = s.current-Number(_activeSessionDraft.buyin || 0)+s.next; }
  else if (count>1) { _activeSessionDraft.rebuy = Math.max(0,s.current-Number(_activeSessionDraft.buyin || 0)-(costs.pop() || 0)); }
  g.costs = costs;
  _activeSessionDraft.bullets = Math.max(1,count+delta);
  var input = document.getElementById('s-rebuy');
  if (input && _activeSessionDraft.rebuy != null) input.value = _activeSessionDraft.rebuy || '';
  return true;
}
