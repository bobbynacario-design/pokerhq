var _blindTicker=null;
function liveClockHtml(){
  if(!_activeSessionDraft)return '';var c=_activeSessionDraft.liveClock||{level:1,minutes:30,bigBlind:0,chips:0,breakMinutes:60};
  function input(key,label,min){return '<div class="form-group"><label class="form-label" for="lc-'+key+'">'+label+'</label><input class="form-input" id="lc-'+key+'" type="number" min="'+min+'" value="'+c[key]+'" onchange="setLiveClockField(\''+key+'\',this.value)"></div>';}
  return '<details class="live-clock-panel" '+(c.configured?'open':'')+'><summary>Blind level, stack &amp; breaks</summary><p class="slate-intro">Use the room’s actual blinds. Advance the level manually; reminders appear here while the app is open.</p><div class="live-clock-fields">'+input('level','Level',1)+input('minutes','Level minutes',1)+input('bigBlind','Big blind (chips)',1)+input('chips','Your stack (chips)',0)+input('breakMinutes','Break reminder (min)',1)+'</div><div class="live-clock-status" role="status"><strong id="live-level-time"></strong><span id="live-stack-bb"></span><span id="live-break-note"></span></div><div class="surface-actions"><button class="sec-action primary" onclick="toggleLiveClock()">'+(c.running?'PAUSE LEVEL':c.started?'RESUME LEVEL':'START LEVEL CLOCK')+'</button><button class="sec-action" onclick="nextLiveLevel()">NEXT LEVEL</button><button class="sec-action" onclick="acknowledgeLiveBreak()">BREAK TAKEN</button></div></details>';
}
function ensureLiveClock(){
  if(!_activeSessionDraft)return null;
  if(!_activeSessionDraft.liveClock)_activeSessionDraft.liveClock={level:1,minutes:30,bigBlind:0,chips:0,breakMinutes:60,remaining:1800000,played:0,running:false,startedAt:Date.now(),nextBreak:3600000};
  return _activeSessionDraft.liveClock;
}
function setLiveClockField(key,value){
  var c=ensureLiveClock();if(!c)return;var n=Number(value),min=key==='chips'?0:1;
  if(!isFinite(n)||n<min){renderActiveSessionSurface();return;}
  c=PokerHQLiveClock.settle(c,Date.now());c[key]=n;c.configured=true;
  if(key==='minutes')c.remaining=n*60000;
  if(key==='breakMinutes')c.nextBreak=c.played+n*60000;
  _activeSessionDraft.liveClock=c;
  // Keep the form in place so Tab and taps can move naturally to the next field.
  saveScopedUiJson(ACTIVE_SESSION_DRAFT_STORAGE_KEY,_activeSessionDraft);updateLiveClockDisplay();
}
function toggleLiveClock(){var c=ensureLiveClock();if(!c)return;c=PokerHQLiveClock.settle(c,Date.now());c.running=!c.running;c.configured=true;c.started=true;_activeSessionDraft.liveClock=c;persistActiveSessionDraft();}
function nextLiveLevel(){var c=ensureLiveClock();if(!c)return;c=PokerHQLiveClock.settle(c,Date.now());c.level++;c.remaining=c.minutes*60000;c.configured=true;_activeSessionDraft.liveClock=c;persistActiveSessionDraft();}
function acknowledgeLiveBreak(){var c=ensureLiveClock();if(!c)return;c=PokerHQLiveClock.settle(c,Date.now());c.nextBreak=c.played+c.breakMinutes*60000;_activeSessionDraft.liveClock=c;persistActiveSessionDraft();}
function updateLiveClockDisplay(){
  var c=_activeSessionDraft&&_activeSessionDraft.liveClock,s=PokerHQLiveClock.snapshot(c,Date.now());
  document.querySelectorAll('#live-level-time').forEach(function(el){var sec=Math.ceil(s.remaining/1000);el.textContent=c?'Level '+c.level+' · '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')+(s.levelDue?' · Level complete':''):'Clock ready';});
  document.querySelectorAll('#live-stack-bb').forEach(function(el){el.textContent=s.bb===null?'Enter the big blind to convert your stack.':s.bb+' BB';});
  document.querySelectorAll('#live-break-note').forEach(function(el){el.textContent=c?(s.breakDue?'Break reminder — take a reset when the room allows.':'Next break reminder in '+Math.ceil(Math.max(0,c.nextBreak-s.played)/60000)+' min'):'';});
}
function refreshLiveClock(){
  clearInterval(_blindTicker);_blindTicker=null;updateLiveClockDisplay();
  if(_activeSessionDraft&&_activeSessionDraft.liveClock&&_activeSessionDraft.liveClock.running)_blindTicker=setInterval(updateLiveClockDisplay,1000);
}
