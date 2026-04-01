function getStudyLoopStatus() {
  var now = new Date(), weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  var thisWeekSessions = sessions.filter(function(s) { return new Date(s.date) >= weekStart; });
  var thisWeekHands = hands.filter(function(h) { return thisWeekSessions.some(function(s) { return s.id === h.sessionId; }); });
  var thisWeekNotes = strategies.filter(function(s) { return new Date(s.id) >= weekStart.getTime(); });
  var thisWeekBriefing = newsItems.filter(function(n) { return new Date(n.id) >= weekStart.getTime(); });
  return {
    sessions: thisWeekSessions.length,
    hands: thisWeekHands.length,
    notes: thisWeekNotes.length,
    briefing: thisWeekBriefing.length > 0
  };
}

function renderStudyLoop() {
  var wrap = document.getElementById('study-loop-wrap');
  if (!wrap) return;
  if (!sessions.length) {
    wrap.innerHTML = '';
    return;
  }
  var st = getStudyLoopStatus();
  var items = [
    {
      done: st.sessions > 0,
      label: 'Sessions<br>logged',
      count: st.sessions,
      actionLabel: 'LOG SESSION',
      action: 'document.getElementById(\'s-date\').scrollIntoView({behavior:\'smooth\',block:\'center\'})'
    },
    {
      done: st.hands > 0,
      label: 'Hands<br>reviewed',
      count: st.hands,
      actionLabel: 'LOG HAND',
      action: 'openNewHandModal()'
    },
    {
      done: st.notes > 0,
      label: 'Study note<br>added',
      count: st.notes,
      actionLabel: 'ADD NOTE',
      action: 'switchGroup(\'improve\',\'strategy\');setTimeout(function(){var el=document.getElementById(\'strat-topic\');if(el){el.focus();el.scrollIntoView({behavior:\'smooth\',block:\'center\'});}},250)'
    },
    {
      done: st.briefing,
      label: 'Briefing<br>imported',
      count: st.briefing ? 1 : 0,
      actionLabel: 'IMPORT',
      action: 'switchGroup(\'improve\',\'strategy\');setTimeout(function(){var el=document.getElementById(\'strategy-raw\');if(el){el.focus();el.scrollIntoView({behavior:\'smooth\',block:\'center\'});}},250)'
    }
  ];
  var html = '<div class="study-loop-card">';
  html += '<div class="study-loop-title">This week\'s study loop</div>';
  html += '<div class="study-loop-items">';
  items.forEach(function(item) {
    html += '<div class="study-loop-item">';
    html += '<div class="sli-status">' + (item.done ? '✅' : '⭕') + '</div>';
    html += '<div class="sli-label">' + item.label + '</div>';
    if (!item.done) {
      html += '<div class="sli-action" onclick="' + item.action + '">' + item.actionLabel + ' →</div>';
    } else {
      html += '<div style="font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.5)">' + item.count + (item.count === 1 ? ' time' : ' times') + '</div>';
    }
    html += '</div>';
  });
  html += '</div></div>';
  wrap.innerHTML = html;
}

function renderStrategyNudge() {
  var wrap = document.getElementById('strategy-nudge-wrap');
  if (!wrap) return;
  var st = getStudyLoopStatus();
  if (st.sessions === 0 || st.notes > 0) {
    wrap.innerHTML = '';
    return;
  }
  var handsText = st.hands === 1 ? '1 hand' : st.hands + ' hands';
  var sessionsText = st.sessions === 1 ? '1 session' : st.sessions + ' sessions';
  wrap.innerHTML = '<div class="strategy-nudge">'
    + '<div class="strategy-nudge-text">This week: ' + sessionsText + ' · ' + handsText + ' logged · 0 study notes</div>'
    + '<div class="strategy-nudge-link" onclick="document.getElementById(\'strat-topic\').focus();document.getElementById(\'strat-topic\').scrollIntoView({behavior:\'smooth\',block:\'center\'})">Complete your loop →</div>'
    + '</div>';
}
