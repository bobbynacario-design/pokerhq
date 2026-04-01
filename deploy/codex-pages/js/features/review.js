var _toastSid = null;
var _toastTimer = null;

function getSessionVenueHistory(session) {
  return sessions.filter(function(item) {
    return item.id !== session.id && item.venue && session.venue && item.venue === session.venue;
  });
}

function getSessionMentalSummary(session) {
  var ratings = [session.focus, session.energy, session.sleep].filter(function(value) {
    return !!value;
  });
  var avg = ratings.length ? ratings.reduce(function(sum, value) { return sum + value; }, 0) / ratings.length : 0;
  return {
    avg: avg,
    hasAny: ratings.length > 0 || !!session.fasting,
    lowFocus: !!session.focus && session.focus <= 4,
    lowEnergy: !!session.energy && session.energy <= 4,
    lowSleep: !!session.sleep && session.sleep <= 4,
    strongState: ratings.length > 0 && avg >= 7.5,
    fasted: session.fasting === 'yes'
  };
}

function getSessionHandSignals(linkedHands) {
  var lessons = linkedHands.map(function(hand) { return (hand.lesson || '').trim(); }).filter(Boolean);
  var lost = linkedHands.filter(function(hand) { return hand.result === 'lost'; });
  var won = linkedHands.filter(function(hand) { return hand.result === 'won'; });
  return {
    lessons: lessons,
    lost: lost,
    won: won
  };
}

function firstNonEmpty(items, fallback) {
  for (var i = 0; i < items.length; i++) {
    if (items[i]) return items[i];
  }
  return fallback;
}

function buildSessionDebrief(session, linkedHands) {
  var mental = getSessionMentalSummary(session);
  var handSignals = getSessionHandSignals(linkedHands);
  var venueHistory = getSessionVenueHistory(session);
  var venuePnl = venueHistory.reduce(function(sum, item) { return sum + (item.pnl || 0); }, 0);
  var venueItm = venueHistory.filter(function(item) { return item.result === 'itm' || item.result === 'final'; }).length;
  var venueWinRate = venueHistory.length ? Math.round((venueItm / venueHistory.length) * 100) : 0;

  var wentWell = firstNonEmpty([
    session.result === 'final' ? 'You converted this run into a final-table finish and gave yourself a result worth studying, not just a grind log.' : '',
    session.result === 'itm' ? 'You cashed the tournament, which usually means enough patience and structure to survive into meaningful spots.' : '',
    mental.strongState ? 'Your mental and physical ratings were strong, which points to a good pre-session baseline and steadier decision quality.' : '',
    linkedHands.length ? 'You captured ' + linkedHands.length + ' linked hand' + (linkedHands.length !== 1 ? 's' : '') + ' while context was fresh, which gives you real review material instead of relying on memory.' : '',
    venueHistory.length && venuePnl > 0 ? 'Recent history at ' + session.venue + ' is positive, so this venue may already fit your preparation and game selection well.' : ''
  ], 'You finished the session log with enough context to review the run properly, which is already a strong discipline win.');

  var hurt = firstNonEmpty([
    session.result === 'bust' ? 'The session still ended in a bust, so stack preservation and inflection-point decisions likely mattered more than the final score alone suggests.' : '',
    session.pnl < 0 ? 'The run lost money overall, which raises the value of checking whether bustout pressure or a thin shot crept into your choices.' : '',
    mental.lowEnergy || mental.lowSleep ? 'Low energy or sleep ratings suggest your physical baseline may have reduced patience and accuracy as the session went on.' : '',
    mental.lowFocus ? 'Focus was rated low, which is often where small attention leaks turn into avoidable stack loss.' : '',
    mental.fasted ? 'You marked the session as fasted, so energy management may have added hidden pressure later in the run.' : '',
    handSignals.lost.length > handSignals.won.length && linkedHands.length ? 'Most saved hands from this run were losses, so the highest-value review is probably around where chips left the stack.' : '',
    venueHistory.length >= 3 && venuePnl < 0 ? 'Recent history at ' + session.venue + ' is negative, so the venue or field mix may be exposing a recurring leak.' : ''
  ], 'No single red flag dominates the log, so the best approach is to isolate one pressure point instead of inventing problems that are not in the data.');

  var reviewNext = firstNonEmpty([
    handSignals.lessons.length ? 'Start with the saved lesson: ' + handSignals.lessons[0] : '',
    linkedHands.length ? 'Replay ' + linkedHands[0].title + ' first, then compare it to the rest of the linked hands for the same pattern.' : '',
    session.result === 'bust' && session.position ? 'Review the bustout phase and the decisions leading into position ' + session.position + '.' : '',
    venueHistory.length ? 'Compare this run against your last ' + venueHistory.length + ' session' + (venueHistory.length !== 1 ? 's' : '') + ' at ' + session.venue + ' to see whether the same pattern keeps repeating.' : ''
  ], 'Use the session summary, result, and mental ratings together to identify the one decision band that deserves deeper review.');

  var focusItem = firstNonEmpty([
    mental.lowSleep || mental.lowEnergy ? 'Protect next-session readiness before you sit: sleep, energy, and food are the first edge to lock in.' : '',
    mental.lowFocus ? 'Start the next session with a stricter attention rule: one reset note at every break or level change.' : '',
    linkedHands.length ? 'Enter the next session ready to tag one key hand early and one key hand late so the review set stays balanced.' : '',
    venueHistory.length >= 3 && venuePnl < 0 ? 'Go into the next ' + session.venue + ' session with one clear field-adjustment note, not a generic A-game reminder.' : '',
    session.result === 'bust' ? 'Next session, decide in advance where you stop bleeding chips and switch to simpler, higher-confidence lines.' : ''
  ], 'Carry one simple focus into the next session: capture the highest-pressure hand while it is still fresh.');

  return {
    wentWell: wentWell,
    hurt: hurt,
    reviewNext: reviewNext,
    focusItem: focusItem,
    context: {
      handCount: linkedHands.length,
      venueHistoryCount: venueHistory.length,
      venueWinRate: venueWinRate,
      venuePnl: venuePnl
    }
  };
}

function getSessionDebriefAiConfig() {
  var cfg = window.PokerHQAI || window.pokerhqAI || null;
  if (!cfg) return null;
  var apiKey = cfg.apiKey || cfg.anthropicApiKey || '';
  if (!apiKey) return null;
  return {
    provider: 'anthropic',
    apiKey: apiKey,
    model: cfg.model || 'claude-sonnet-4-6'
  };
}

function buildSessionDebriefHtml(report) {
  var aiConfig = getSessionDebriefAiConfig();
  var html = '<div class="review-card" style="margin-bottom:1rem;border-color:rgba(52,152,219,.2)">';
  html += '<div class="review-card-title">Session Debrief</div>';
  html += '<div class="review-card-copy">Lightweight local pattern read built from result, mental state, linked hands, and venue history.</div>';
  html += '<div style="display:grid;gap:.65rem;margin-top:.9rem">';
  html += '<div style="background:var(--bg3);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem">What went well</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65">' + report.wentWell + '</div></div>';
  html += '<div style="background:var(--bg3);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem">What likely hurt performance</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65">' + report.hurt + '</div></div>';
  html += '<div style="background:var(--bg3);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem">What to review next</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65">' + report.reviewNext + '</div></div>';
  html += '<div style="background:rgba(52,152,219,.08);border:1px solid rgba(52,152,219,.2);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(52,152,219,.9);margin-bottom:.35rem">Next-session focus</div><div style="font-size:13px;color:#fff;line-height:1.65">' + report.focusItem + '</div></div>';
  html += '</div>';
  if (report.context.handCount || report.context.venueHistoryCount) {
    html += '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem">';
    if (report.context.handCount) html += '<div style="font-family:var(--mono);font-size:10px;padding:.35rem .65rem;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid var(--rim2);color:rgba(255,255,255,.5)">' + report.context.handCount + ' linked hand' + (report.context.handCount !== 1 ? 's' : '') + '</div>';
    if (report.context.venueHistoryCount) html += '<div style="font-family:var(--mono);font-size:10px;padding:.35rem .65rem;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid var(--rim2);color:rgba(255,255,255,.5)">' + report.context.venueHistoryCount + ' prior session' + (report.context.venueHistoryCount !== 1 ? 's' : '') + ' at venue</div>';
    html += '</div>';
  }
  if (aiConfig) {
    html += '<div style="margin-top:.85rem;display:flex;gap:.5rem;flex-wrap:wrap"><button class="sec-action" onclick="enhanceSessionDebriefWithAi(window._currentDebriefSessionId)">ENHANCE WITH AI</button></div>';
  }
  html += '<div id="sd-debrief-ai-wrap" style="margin-top:.85rem"></div>';
  html += '</div>';
  return html;
}

function buildAiDebriefPrompt(session, linkedHands, localReport) {
  var venueHistory = getSessionVenueHistory(session).map(function(item) {
    return {
      date: item.date || '',
      name: item.name || '',
      pnl: item.pnl || 0,
      result: item.result || '',
      focus: item.focus || 0,
      energy: item.energy || 0,
      sleep: item.sleep || 0,
      fasting: item.fasting || ''
    };
  });
  var handContext = linkedHands.map(function(hand) {
    return {
      title: hand.title || '',
      result: hand.result || '',
      desc: hand.desc || '',
      lesson: hand.lesson || ''
    };
  });
  return 'You are enhancing a poker session review. Improve the existing local debrief, but stay concrete, concise, and practical. Respond only with valid JSON using exactly this shape: {"wentWell":"","hurt":"","reviewNext":"","focusItem":""}. Session: ' + JSON.stringify({
    date: session.date || '',
    name: session.name || '',
    venue: session.venue || '',
    buyin: session.buyin || 0,
    total: session.total || 0,
    prize: session.prize || 0,
    pnl: session.pnl || 0,
    result: session.result || '',
    hours: session.hours || 0,
    position: session.position || 0,
    field: session.field || 0,
    focus: session.focus || 0,
    energy: session.energy || 0,
    sleep: session.sleep || 0,
    fasting: session.fasting || '',
    notes: session.notes || ''
  }) + ' Linked hands: ' + JSON.stringify(handContext) + ' Venue history: ' + JSON.stringify(venueHistory) + ' Existing local debrief: ' + JSON.stringify(localReport);
}

function buildAiDebriefHtml(report) {
  var html = '<div class="review-card" style="margin-bottom:0;border-color:rgba(212,175,55,.22)">';
  html += '<div class="review-card-title">AI-Enhanced Debrief</div>';
  html += '<div class="review-card-copy">Optional second layer on top of the local debrief.</div>';
  html += '<div style="display:grid;gap:.65rem;margin-top:.9rem">';
  html += '<div style="background:var(--bg3);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem">What went well</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65">' + report.wentWell + '</div></div>';
  html += '<div style="background:var(--bg3);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem">What likely hurt performance</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65">' + report.hurt + '</div></div>';
  html += '<div style="background:var(--bg3);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:rgba(255,255,255,.35);margin-bottom:.35rem">What to review next</div><div style="font-size:13px;color:rgba(255,255,255,.72);line-height:1.65">' + report.reviewNext + '</div></div>';
  html += '<div style="background:rgba(212,175,55,.08);border:1px solid rgba(212,175,55,.18);border-radius:10px;padding:.85rem .95rem"><div style="font-family:var(--mono);font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:var(--gold);margin-bottom:.35rem">Next-session focus</div><div style="font-size:13px;color:#fff;line-height:1.65">' + report.focusItem + '</div></div>';
  html += '</div></div>';
  return html;
}

async function enhanceSessionDebriefWithAi(sid) {
  var target = document.getElementById('sd-debrief-ai-wrap');
  if (!target) return;
  var aiConfig = getSessionDebriefAiConfig();
  if (!aiConfig) return;
  var session = sessions.find(function(item) { return item.id === sid; });
  if (!session) return;
  var linkedHands = hands.filter(function(hand) { return hand.sessionId === sid; });
  var localReport = buildSessionDebrief(session, linkedHands);
  target.innerHTML = '<div class="review-card" style="margin-bottom:0;border-color:rgba(212,175,55,.18)"><div class="review-card-title">AI-Enhanced Debrief</div><div class="review-card-copy">Enhancing the local debrief now...</div></div>';
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiConfig.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: aiConfig.model,
        max_tokens: 900,
        messages: [{
          role: 'user',
          content: buildAiDebriefPrompt(session, linkedHands, localReport)
        }]
      })
    });
    if (!response.ok) throw new Error('AI enhancement failed (' + response.status + ')');
    var data = await response.json();
    var text = (data.content || []).map(function(chunk) { return chunk.text || ''; }).join('');
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('AI returned invalid JSON');
    var parsed = JSON.parse(text.substring(start, end + 1));
    target.innerHTML = buildAiDebriefHtml({
      wentWell: parsed.wentWell || localReport.wentWell,
      hurt: parsed.hurt || localReport.hurt,
      reviewNext: parsed.reviewNext || localReport.reviewNext,
      focusItem: parsed.focusItem || localReport.focusItem
    });
  } catch (err) {
    target.innerHTML = '<div class="review-card" style="margin-bottom:0;border-color:rgba(232,92,92,.2)"><div class="review-card-title">AI Enhancement Unavailable</div><div class="review-card-copy">The local debrief is still available and unchanged. AI enhancement failed cleanly: ' + err.message + '.</div></div>';
  }
}

function renderSessionDebrief(sid) {
  var target = document.getElementById('sd-debrief-wrap');
  if (!target) return;
  var session = sessions.find(function(item){ return item.id === sid; });
  if (!session) return;
  var linkedHands = hands.filter(function(hand){ return hand.sessionId === sid; });
  window._currentDebriefSessionId = sid;
  target.innerHTML = buildSessionDebriefHtml(buildSessionDebrief(session, linkedHands));
}

function viewSessionDetail(sid, fromLog) {
  var s = sessions.find(function(x){ return x.id===sid; });
  if (!s) return;
  var linkedHands = hands.filter(function(h){ return h.sessionId===sid; });
  var staking = window.getSessionStakingData ? getSessionStakingData(s) : null;
  var pnlCls = s.pnl>0 ? 'color:#2DB87A' : s.pnl<0 ? 'color:#E85C5C' : 'color:rgba(255,255,255,.4)';
  var html = fromLog ? '<div class="review-card" style="margin-bottom:1rem;border-color:rgba(212,175,55,.22)"><div class="review-card-title">Session debrief ready</div><div class="review-card-copy">You just logged this session. Add a hand, run a debrief, or open the heatmap before the details fade.</div><div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap"><button class="sec-action" onclick="renderSessionDebrief('+sid+')">AI SESSION DEBRIEF</button><button class="sec-action" onclick="closeModal(\'modal-session-detail\');openHandModalForSession('+sid+')">+ ADD HAND</button><button class="sec-action" onclick="closeModal(\'modal-session-detail\');switchGroup(\'review\',\'heatmap\')">OPEN HEATMAP</button></div></div>' : '';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem">';
  html += '<div style="background:var(--bg3);border-radius:8px;padding:.75rem"><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.25rem">BUY-IN</div><div style="font-family:var(--mono);font-size:16px">₱'+s.total.toLocaleString()+'</div></div>';
  html += '<div style="background:var(--bg3);border-radius:8px;padding:.75rem"><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.25rem">P&L</div><div style="font-family:var(--mono);font-size:16px;'+pnlCls+'">'+fmtCur(s.pnl)+'</div></div>';
  html += '<div style="background:var(--bg3);border-radius:8px;padding:.75rem"><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.25rem">POSITION</div><div style="font-family:var(--mono);font-size:16px">'+(s.position||'—')+(s.field?' / '+s.field:'')+'</div></div>';
  html += '<div style="background:var(--bg3);border-radius:8px;padding:.75rem"><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.25rem">HOURS</div><div style="font-family:var(--mono);font-size:16px">'+(s.hours||'—')+'h</div></div>';
  html += '</div>';
  if (s.notes) html += '<div style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:1.25rem;padding:.75rem;background:var(--bg3);border-radius:8px">📝 '+s.notes+'</div>';
  if (staking) {
    html += '<div style="background:var(--bg3);border-radius:10px;padding:.9rem 1rem;margin-bottom:1.1rem">';
    html += '<div style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:.7rem">Staking</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.65rem">';
    html += '<div><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.2rem">PLAYER / BACKER</div><div style="font-family:var(--mono);font-size:14px">'+staking.playerSharePct.toFixed(0)+'% / '+staking.backerSharePct.toFixed(0)+'%</div></div>';
    html += '<div><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.2rem">MARKUP</div><div style="font-family:var(--mono);font-size:14px">'+staking.markup.toFixed(2)+'x</div></div>';
    html += '<div><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.2rem">PACKAGE VALUE</div><div style="font-family:var(--mono);font-size:14px">₱'+Math.round(staking.packageValue).toLocaleString()+'</div></div>';
    html += '<div><div style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3);margin-bottom:.2rem">PLAYER NET</div><div style="font-family:var(--mono);font-size:14px;'+(staking.playerNet>=0?'color:#2DB87A':'color:#E85C5C')+'">'+fmtCur(staking.playerNet)+'</div></div>';
    html += '</div>';
    if (staking.packageName) html += '<div style="font-family:var(--mono);font-size:10px;color:var(--gold);margin-top:.65rem">PACKAGE: '+staking.packageName+'</div>';
    html += '</div>';
  }
  html += '<div id="sd-debrief-wrap" style="margin-bottom:1rem"></div>';

  html += '<div style="font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:rgba(255,255,255,.35);text-transform:uppercase;margin-bottom:.75rem">Logged Hands ('+linkedHands.length+')</div>';
  if (!linkedHands.length) {
    html += '<div style="font-size:12px;color:rgba(255,255,255,.25);font-style:italic;margin-bottom:.75rem">No hands logged for this session yet.</div>';
  } else {
    linkedHands.forEach(function(h) {
      var rc = {won:'#2DB87A',lost:'#E85C5C',fold:'rgba(255,255,255,.3)'}[h.result] || 'rgba(255,255,255,.3)';
      var rl = {won:'WON',lost:'LOST',fold:'FOLD'}[h.result] || 'FOLD';
      html += '<div style="background:var(--bg3);border-radius:8px;padding:.75rem;margin-bottom:.5rem">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.35rem"><span style="font-size:13px;font-weight:500;color:#fff">'+h.title+'</span><div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap"><button class="sec-action" style="padding:.25rem .6rem;font-size:10px" onclick="closeModal(\'modal-session-detail\');openHandReplay('+h.id+')">REPLAY</button><span style="font-family:var(--mono);font-size:9px;padding:2px 7px;border-radius:20px;background:rgba(0,0,0,.3);color:'+rc+'">'+rl+'</span></div></div>';
      if (h.desc) html += '<div style="font-size:12px;color:rgba(255,255,255,.45);line-height:1.6;margin-bottom:.35rem">'+h.desc+'</div>';
      if (h.lesson) html += '<div style="font-size:11px;color:var(--gold);font-family:var(--mono)">💡 '+h.lesson+'</div>';
      html += '</div>';
    });
  }

  html += '<div class="review-rail"><div class="review-card"><div class="review-card-title">Review this run</div><div class="review-card-copy">Hands linked here become much more useful when you review them alongside finish, P&amp;L, and mental state.</div><div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap"><button class="sec-action" onclick="closeModal(\'modal-session-detail\');openHandModalForSession('+sid+')">+ ADD HAND</button><button class="sec-action" onclick="closeModal(\'modal-session-detail\');switchGroup(\'review\',\'heatmap\')">OPEN HEATMAP</button></div></div><div class="review-card"><div class="review-card-title">Turn this session into a lesson</div><div class="review-card-copy">Create one clear takeaway now so your next live session starts sharper.</div><div style="margin-top:.75rem;display:flex;gap:.5rem;flex-wrap:wrap"><button class="sec-action" onclick="renderSessionDebrief('+sid+')">AI SESSION DEBRIEF</button><button class="sec-action" onclick="closeModal(\'modal-session-detail\');switchGroup(\'improve\',\'strategy\');setTimeout(function(){var el=document.getElementById(\'strat-topic\');if(el){el.focus();el.scrollIntoView({behavior:\'smooth\',block:\'center\'});}},250)">CREATE SESSION DEBRIEF</button></div></div></div>';

  document.getElementById('sd-title').textContent = s.name + ' — ' + s.date;
  document.getElementById('sd-body').innerHTML = html;
  openModal('modal-session-detail');
}

function openHandModalForSession(sid) {
  var s = sessions.find(function(x){ return x.id===sid; });
  var sessionLabel = s ? s.name + ' — ' + s.date : '';
  if (window.prepareNewHandForm) {
    prepareNewHandForm({
      sessionId: s ? s.id : 0,
      sessionLabel: sessionLabel,
      pendingSessionKey: '',
      result: 'lost'
    });
  }
  openModal('modal-hand');
  setTimeout(function(){
    var sl = document.getElementById('h-session-link');
    if (sl && s) { sl.value = sid; }
    var pk = document.getElementById('h-pending-session-key');
    if (pk) pk.value = '';
    var hs = document.getElementById('h-session');
    if (hs && s) hs.value = sessionLabel;
  }, 100);
}

function renderHeatmap() {
  if (!sessions.length) {
    ['hmap-venue','hmap-buyin','hmap-itm','hmap-roi','hmap-monthly'].forEach(function(id){
      var e = document.getElementById(id);
      if (e) e.innerHTML = '<div class="heatmap-empty">Log sessions to see heatmap</div>';
    });
    renderMentalHeatmap();
    return;
  }

  var venueMap = {};
  sessions.forEach(function(s) {
    var v = s.venue || 'Unknown';
    if (!venueMap[v]) venueMap[v] = {pnl:0,count:0,itm:0};
    venueMap[v].pnl += s.pnl || 0;
    venueMap[v].count++;
    if (s.result === 'itm' || s.result === 'final') venueMap[v].itm++;
  });
  renderHeatmapBars('hmap-venue', Object.keys(venueMap).map(function(k){
    return {label:k, val:venueMap[k].pnl, display:fmtCur(venueMap[k].pnl)};
  }));

  var ranges = [
    {label:'₱0–₱2,999', min:0, max:2999},
    {label:'₱3k–₱5,999', min:3000, max:5999},
    {label:'₱6k–₱9,999', min:6000, max:9999},
    {label:'₱10k–₱15k', min:10000, max:15000},
    {label:'₱15k+', min:15001, max:999999}
  ];
  var rangeData = ranges.map(function(r) {
    var inRange = sessions.filter(function(s){ return s.total>=r.min && s.total<=r.max; });
    var pnl = inRange.reduce(function(a, session){ return a + (session.pnl || 0); }, 0);
    return {label:r.label, val:pnl, display:fmtCur(pnl)+' ('+inRange.length+')'};
  }).filter(function(r){ return r.val!==0; });
  renderHeatmapBars('hmap-buyin', rangeData);

  renderHeatmapBars('hmap-itm', Object.keys(venueMap).map(function(k) {
    var v = venueMap[k];
    var rate = v.count>0 ? Math.round((v.itm/v.count)*100) : 0;
    return {label:k, val:rate, display:rate+'% ITM ('+v.count+' sessions)', neutral:true};
  }), 100);

  var nameMap = {};
  sessions.forEach(function(s) {
    var n = s.name || 'Unknown';
    if (!nameMap[n]) nameMap[n] = {invested:0,returned:0};
    nameMap[n].invested += s.total || 0;
    nameMap[n].returned += s.prize || 0;
  });
  renderHeatmapBars('hmap-roi', Object.keys(nameMap).map(function(k) {
    var v = nameMap[k];
    var roi = v.invested>0 ? Math.round(((v.returned-v.invested)/v.invested)*100) : 0;
    return {label:k, val:roi, display:roi+'% ROI'};
  }));

  var monthlyEl = document.getElementById('hmap-monthly');
  if (monthlyEl) {
    var now = new Date();
    var monthData = {};
    sessions.forEach(function(s) {
      if (!s.date) return;
      var d = new Date(s.date+'T00:00:00');
      var key = d.getFullYear()+'-'+(d.getMonth()+1);
      if (!monthData[key]) monthData[key] = {pnl:0,count:0};
      monthData[key].pnl += s.pnl || 0;
      monthData[key].count++;
    });
    var html = '';
    for (var i=11; i>=0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      var key = d.getFullYear()+'-'+(d.getMonth()+1);
      var mon = monthData[key];
      var label = d.toLocaleString('en', {month:'short', year:'2-digit'});
      var bg, title;
      if (!mon) {
        bg = 'rgba(255,255,255,.06)';
        title = label+': No data';
      } else if (mon.pnl>0) {
        var intensity = Math.min(1, mon.pnl/10000);
        bg = 'rgba(45,184,122,'+(0.2+intensity*0.6)+')';
        title = label+': '+fmtCur(mon.pnl)+' ('+mon.count+' sessions)';
      } else {
        var negIntensity = Math.min(1, Math.abs(mon.pnl)/10000);
        bg = 'rgba(232,92,92,'+(0.2+negIntensity*0.6)+')';
        title = label+': '+fmtCur(mon.pnl)+' ('+mon.count+' sessions)';
      }
      html += '<div class="month-cell" style="background:'+bg+'" title="'+title+'"><div class="month-tooltip">'+title+'</div></div>';
    }
    monthlyEl.innerHTML = html;
  }

  renderMentalHeatmap();
}

function renderHeatmapBars(elId, data, maxVal) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!data.length) {
    el.innerHTML = '<div class="heatmap-empty">No data yet</div>';
    return;
  }
  var sorted = data.slice().sort(function(a,b){ return Math.abs(b.val)-Math.abs(a.val); });
  var max = maxVal || Math.max.apply(null, sorted.map(function(d){ return Math.abs(d.val) || 1; }));
  el.innerHTML = sorted.map(function(d) {
    var pct = Math.round((Math.abs(d.val)/max)*100);
    var cls = d.neutral ? 'heat-neutral' : d.val>=0 ? 'heat-pos' : 'heat-neg';
    var textCol = d.neutral ? 'rgba(201,168,76,.9)' : d.val>=0 ? 'rgba(45,184,122,.9)' : 'rgba(232,92,92,.9)';
    return '<div class="heatmap-row"><div class="heatmap-label" title="'+d.label+'">'+d.label+'</div><div class="heatmap-bar-wrap"><div class="heatmap-bar-fill '+cls+'" style="width:'+Math.max(pct,4)+'%"><span class="heatmap-bar-val" style="color:'+textCol+'">'+d.display+'</span></div></div></div>';
  }).join('');
}

function renderMentalHeatmap() {
  var el = document.getElementById('hmap-mental');
  if (!el) return;
  var withData = sessions.filter(function(s){ return s.focus || s.energy || s.sleep; });
  if (!withData.length) {
    el.innerHTML = '<div class="heatmap-empty">Log mental stats with sessions to see trends</div>';
    return;
  }

  var ranges = [
    {label:'Focus 1-4 (Low)', filter:function(s){ return s.focus && s.focus<=4; }},
    {label:'Focus 5-7 (Mid)', filter:function(s){ return s.focus && s.focus>=5 && s.focus<=7; }},
    {label:'Focus 8-10 (High)', filter:function(s){ return s.focus && s.focus>=8; }},
    {label:'Energy 1-4 (Low)', filter:function(s){ return s.energy && s.energy<=4; }},
    {label:'Energy 5-7 (Mid)', filter:function(s){ return s.energy && s.energy>=5 && s.energy<=7; }},
    {label:'Energy 8-10 (High)', filter:function(s){ return s.energy && s.energy>=8; }},
    {label:'Fasted', filter:function(s){ return s.fasting==='yes'; }},
    {label:'Not Fasted', filter:function(s){ return s.fasting==='no'; }}
  ];
  var data = ranges.map(function(r) {
    var matching = withData.filter(r.filter);
    if (!matching.length) return null;
    var pnl = matching.reduce(function(a, session){ return a + (session.pnl || 0); }, 0);
    return {label:r.label, val:pnl, display:fmtCur(pnl)+' ('+matching.length+')'};
  }).filter(Boolean);

  renderHeatmapBars('hmap-mental', data);
}

function showSessionToast(pnl, sid) {
  _toastSid = sid;
  var el = document.getElementById('session-toast');
  var pnlEl = document.getElementById('toast-pnl');
  if (!el) return;
  if (pnlEl) pnlEl.textContent = pnl;
  pnlEl.style.color = pnl.includes('-') ? 'var(--red)' : 'var(--green)';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(hideSessionToast, 8000);
}

function hideSessionToast() {
  var el = document.getElementById('session-toast');
  if (el) el.classList.remove('show');
  clearTimeout(_toastTimer);
}

function logHandFromToast() {
  hideSessionToast();
  if (_toastSid) openHandModalForSession(_toastSid);
  else openModal('modal-hand');
}
