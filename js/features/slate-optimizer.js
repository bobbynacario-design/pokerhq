var _slateDraft = null;
var SLATE_PAGE_SIZE = 6;
var _slatePreferences = null;
var _slatePreferenceScope = '';

function renderSlatePreferences() {
  var wrap = document.getElementById('slate-personalize-controls');
  if (!wrap) return;
  var cfg = window.PokerHQConfig || {}, scope = (cfg.resolveUiStorageKey ? cfg.resolveUiStorageKey('slate_preferences') : 'pokerhq_slate_preferences') + ':' + !!window._demoMode;
  if (_slatePreferences && scope === _slatePreferenceScope) return;
  _slatePreferenceScope = scope;
  var saved = window._demoMode ? {} : readScopedUiJson('slate_preferences','pokerhq_slate_preferences',{});
  _slatePreferences = { history: saved.history !== false, format: SESSION_FORMATS.indexOf(saved.format)>=0 ? saved.format : 'auto', maxHours: Number(saved.maxHours)>0 ? Number(saved.maxHours) : '', days: Array.isArray(saved.days) ? saved.days.filter(function(d) { return Number.isInteger(d) && d>=0 && d<=6; }) : [0,1,2,3,4,5,6] };
  wrap.innerHTML = '<label class="slate-history-toggle"><input id="slate-use-history" type="checkbox" onchange="setSlatePreference(\'history\',this.checked)" '+(_slatePreferences.history ? 'checked' : '')+'> Use my session history</label>' +
    '<div class="form-grid"><div class="form-group"><label class="form-label" for="slate-preferred-format">Preferred format</label><select class="form-input" id="slate-preferred-format" onchange="setSlatePreference(\'format\',this.value)"><option value="auto">Learn from my sessions</option>'+SESSION_FORMATS.map(function(f) { return '<option '+(_slatePreferences.format===f ? 'selected ' : '')+'value="'+esc(f)+'">'+esc(f)+'</option>'; }).join('')+'</select></div>'+
    '<div class="form-group"><label class="form-label" for="slate-max-hours">Time available per event (hours)</label><input class="form-input" type="number" min="0.5" step="0.5" id="slate-max-hours" placeholder="Optional" value="'+_slatePreferences.maxHours+'" oninput="setSlatePreference(\'maxHours\',this.value)"></div></div>'+
    '<fieldset class="slate-days"><legend>Available days</legend>'+[1,2,3,4,5,6,0].map(function(d) { return '<label><input type="checkbox" value="'+d+'" aria-label="Available '+['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d]+'" '+(_slatePreferences.days.indexOf(d)>=0 ? 'checked ' : '')+'onchange="setSlateAvailableDay('+d+',this.checked)">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]+'</label>'; }).join('')+'</fieldset>'+
    '<p class="slate-footnote">Saved on this device. Estimates use at least 3 relevant sessions. Events with unknown duration need a schedule check.</p>';
}

function setSlatePreference(key,value) {
  if (!_slatePreferences) renderSlatePreferences();
  _slatePreferences[key] = key==='maxHours' ? (value==='' ? '' : Number(value)) : value;
  saveScopedUiJson('slate_preferences',_slatePreferences);
  invalidateSlateDraft();
}

function setSlateAvailableDay(day,available) {
  var days = _slatePreferences.days.filter(function(d) { return d!==day; });
  if (available) days.push(day);
  setSlatePreference('days',days);
}

function slatePickReasons(c) {
  var p = c.personal || {}, reasons = [];
  if (c.event.planning) reasons.push('Already in your plan');
  if (c.event.status==='target') reasons.push('Buy-in fits your current bankroll rule');
  else if (c.event.status==='stretch') reasons.push('Buy-in stretches your current bankroll rule');
  else reasons.push('Buy-in exceeds your current bankroll rule; review before playing');
  reasons = reasons.concat(p.reasons || []);
  if (PokerHQSlate.guarantee(c.event.gtd)) reasons.push('Published guarantee is part of the ranking');
  if (p.cost) reasons.push('Typical entry spend: '+fmtCur(p.cost)+' · '+p.costSamples+' '+p.scope+' sessions'+(p.costSamples<10 ? ' · limited sample' : ''));
  else reasons.push(p.usingHistory===false ? 'Session-history estimates are turned off' : 'Entry-cost estimate needs 3 comparable logged sessions'+(p.earlyCount ? ' · '+p.earlyCount+' available' : ''));
  if (p.hours) reasons.push('Typical session: '+p.hours+' hours · '+p.hourSamples+' '+p.scope+' sessions');
  else reasons.push('Duration unknown — check the event schedule');
  if (p.outsidePreferences) reasons.push('Outside your day/time preferences; kept because it is already pinned');
  return '<ul>'+reasons.map(function(r) { return '<li>'+esc(r)+'</li>'; }).join('')+'</ul><p>History reflects your habits and entry costs. Set a reserve for extra entries.</p>';
}

function invalidateSlateDraft(message) {
  _slateDraft = null;
  var out = document.getElementById('slate-results');
  if (out) out.innerHTML = '<p class="slate-empty">'+esc(message || 'Ready when you are. Build the slate to use these limits.')+'</p>';
}

function setSlateDateWindow(days) {
  var start = new Date(todayLocal()+'T12:00:00'), end = new Date(start);
  end.setDate(end.getDate()+days-1);
  document.getElementById('slate-from').value = todayLocal(start);
  document.getElementById('slate-to').value = todayLocal(end);
  invalidateSlateDraft();
}

function renderSlateLocationFilter() {
  renderSlatePreferences();
  var select = document.getElementById('slate-location');
  if (!select || !window.PokerHQStats) return;
  if (!select.dataset.initialized) {
    select.dataset.initialized = 'true';
    setSlateDateWindow(30);
  }
  var choices = window.PokerHQStats.venueChoices(window.tourneys || []);
  var value = select.value;
  if (value !== '*' && !choices.some(function(c) { return c.key === value; })) value = '';
  if (!value && !select.dataset.userChoice) {
    if (typeof calVenueFilter !== 'undefined' && choices.some(function(c) { return c.key === calVenueFilter; })) value = calVenueFilter;
    else if (choices.length === 1) value = choices[0].key;
  }
  var signature = choices.map(function(c) { return c.key+':'+c.label; }).join('|');
  if (select.dataset.signature !== signature) {
    select.dataset.signature = signature;
    select.innerHTML = '<option value="">Choose a location</option><option value="*">All locations — grouped</option>'+choices.map(function(c) {
      return '<option value="'+esc(c.key)+'">'+esc(c.label)+'</option>';
    }).join('');
  }
  select.value = value;
}

function renderSlateOptimizer() {
  var out = document.getElementById('slate-results');
  if (!out || !window.PokerHQSlate) return;
  renderSlateLocationFilter();
  _slateDraft = null;
  var location = document.getElementById('slate-location').value;
  if (!location) { invalidateSlateDraft('Choose a location first, or choose All locations to compare places.'); return; }
  var budget = Number(document.getElementById('slate-budget').value);
  var capText = document.getElementById('slate-max-buyin').value, reserveText = document.getElementById('slate-reserve').value;
  var maxBuyin = capText === '' ? budget : Number(capText), reserve = reserveText === '' ? 0 : Number(reserveText);
  var travel = Number(document.getElementById('slate-travel').value || 0), hotel = Number(document.getElementById('slate-hotel').value || 0);
  var from = document.getElementById('slate-from').value || todayLocal(), to = document.getElementById('slate-to').value;
  if (!isFinite(budget) || !isFinite(maxBuyin) || !isFinite(reserve) || budget<=0 || maxBuyin<=0 || reserve<0 || reserve>=budget) {
    invalidateSlateDraft('Enter a positive budget and buy-in cap, with a reserve smaller than the budget.'); return;
  }
  if (to && to<from) { invalidateSlateDraft('The end date must be on or after the start date.'); return; }
  if (!isFinite(travel) || !isFinite(hotel) || travel<0 || hotel<0) { invalidateSlateDraft('Travel and hotel allowances must be zero or positive.'); return; }
  if (!_slatePreferences.days.length) { invalidateSlateDraft('Choose at least one available day in Personalize picks.'); return; }
  if (_slatePreferences.maxHours!=='' && (!isFinite(_slatePreferences.maxHours) || _slatePreferences.maxHours<=0)) { invalidateSlateDraft('Enter a positive time allowance, or leave it blank.'); return; }
  var history = _slatePreferences.history ? PokerHQPlayerPlanning.profile(window.sessions,todayLocal()) : [];
  var preferences = Object.assign({},_slatePreferences,{days:_slatePreferences.days.slice()});
  var assess = function(t,r) { return PokerHQPlayerPlanning.assessment(t,r,history,preferences); };
  var options = {budget:budget,reserve:reserve,travel:travel,hotel:hotel,from:from,to:to,parse:parseTourneyDateRange};
  var plan = PokerHQPlanning.budget(window.tourneys,[],options);
  var events = window.PokerHQStats.filterByVenue(window.tourneys || [], location === '*' ? '' : location).map(function(t) {
    return Object.assign({},t,{status:typeof gradeBuyin==='function' ? gradeBuyin(t.buyin) : t.status});
  });
  var result = window.PokerHQSlate.optimize(events,{budget:budget,maxBuyin:maxBuyin,reserve:reserve,from:from,to:to,dateRange:parseTourneyDateRange,assess:assess});
  if (!result.candidates.length) { invalidateSlateDraft('No events fit this location, available days and limits. Try a wider date range or adjust Personalize picks.'); return; }
  var freeEvents = result.candidates.filter(function(c) {
    return !c.event.planning && !plan.pinned.some(function(t) { var r=parseTourneyDateRange(t);return r && c.date<=PokerHQSlate.normalizeDate(r.end) && c.endDate>=PokerHQSlate.normalizeDate(r.start); });
  }).map(function(c){return c.event;});
  var additions = PokerHQSlate.optimize(freeEvents,{budget:plan.available,maxBuyin:maxBuyin,from:from,to:to,dateRange:parseTourneyDateRange,assess:assess});
  var suggested = result.candidates.map(function(c) { return !!c.event.planning || additions.selected.some(function(a){return a.event.id===c.event.id;}); });
  _slateDraft = {result:result,options:options,chosen:suggested.slice(),suggested:suggested,shortlist:suggested.slice(),view:'shortlist',page:0,search:'',message:''};
  out.innerHTML = '<div class="slate-selection-bar"><div id="slate-summary" role="status" aria-live="polite"></div><button class="sec-action primary" id="slate-apply" onclick="applySlatePlan()">PIN SELECTED EVENTS</button></div>'+
    '<div class="slate-toolbar"><div class="slate-view-tabs" aria-label="Event lists"><button class="sec-action" id="slate-shortlist-tab" aria-pressed="true" onclick="setSlateView(\'shortlist\')">SHORTLIST</button><button class="sec-action" id="slate-browse-tab" aria-pressed="false" onclick="setSlateView(\'browse\')">BROWSE EVENTS</button></div><div class="slate-bulk-actions"><button class="sec-action" onclick="resetSlateSuggestions()">RESET SUGGESTIONS</button><button class="sec-action" onclick="clearSlateSelection()">CLEAR SELECTION</button></div></div>'+
    '<div id="slate-search-wrap" hidden><label class="form-label" for="slate-search">Find an event</label><input class="form-input" type="search" id="slate-search" placeholder="Search event or venue" oninput="searchSlateEvents(this.value)"></div>'+
    '<p class="slate-list-help" id="slate-list-help"></p><div id="slate-event-list"></div><div id="slate-pagination"></div><p class="slate-footnote">One event per day. Pinning adds calendar stars; existing stars stay as they are.</p>';
  renderSlateEventList();
  updateSlateSummary();
}

function setSlateView(view) {
  if (!_slateDraft) return;
  _slateDraft.view = view;
  _slateDraft.page = 0;
  renderSlateEventList();
}

function searchSlateEvents(value) {
  if (!_slateDraft) return;
  _slateDraft.search = String(value || '').trim().toLowerCase();
  _slateDraft.page = 0;
  renderSlateEventList();
}

function slatePlace(candidate) { return window.PokerHQStats.placeOf(candidate.event.venue); }

function renderSlateEventList() {
  if (!_slateDraft) return;
  var draft = _slateDraft, browsing = draft.view === 'browse';
  var list = draft.result.candidates.map(function(c,i) { return {candidate:c,index:i,place:slatePlace(c)}; }).filter(function(row) {
    if (!browsing) return draft.shortlist[row.index];
    return !draft.search || (row.candidate.event.name+' '+(row.candidate.event.venue || '')+' '+row.place.label).toLowerCase().indexOf(draft.search)!==-1;
  }).sort(function(a,b) { return a.place.label.localeCompare(b.place.label) || a.candidate.date.localeCompare(b.candidate.date) || String(a.candidate.event.time || '').localeCompare(String(b.candidate.event.time || '')) || String(a.candidate.event.name || '').localeCompare(String(b.candidate.event.name || '')); });
  var pageCount = Math.max(1,Math.ceil(list.length/SLATE_PAGE_SIZE));
  draft.page = Math.min(draft.page,pageCount-1);
  var first = draft.page*SLATE_PAGE_SIZE, visible = list.slice(first,first+SLATE_PAGE_SIZE), group = '', html = '';
  document.getElementById('slate-shortlist-tab').textContent = 'SHORTLIST ('+draft.shortlist.filter(Boolean).length+')';
  document.getElementById('slate-browse-tab').textContent = 'BROWSE EVENTS ('+draft.result.candidates.length+')';
  document.getElementById('slate-shortlist-tab').setAttribute('aria-pressed',String(!browsing));
  document.getElementById('slate-browse-tab').setAttribute('aria-pressed',String(browsing));
  document.getElementById('slate-search-wrap').hidden = !browsing;
  document.getElementById('slate-list-help').textContent = browsing ? 'Check an event to add it to your shortlist. Choices stay selected across pages.' : 'Uncheck any pick to leave it out. Browse events to add alternatives.';
  visible.forEach(function(row) {
    var c = row.candidate, name = c.event.name || 'Tournament';
    if (group !== row.place.key) { group = row.place.key; html += '<h3 class="slate-location-heading">'+esc(row.place.label)+'</h3>'; }
    var date = new Date(c.date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
    if (c.endDate!==c.date) date += ' – '+new Date(c.endDate+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    var metadata = date+(c.event.time ? ' · '+c.event.time : '')+(c.event.planning ? ' · Already pinned' : '');
    html += '<div class="slate-candidate"><label class="slate-choice'+(draft.chosen[row.index] ? ' is-selected' : '')+'"><input type="checkbox" aria-label="Select '+esc(name)+'" '+(draft.chosen[row.index] ? 'checked ' : '')+'onchange="toggleSlateChoice('+row.index+',this.checked)"><span class="slate-choice-main"><strong>'+esc(name)+'</strong><span>'+esc(metadata)+'</span></span><span class="slate-choice-price">'+fmtCur(c.buyin)+'</span></label><details class="slate-why"><summary>Why this pick?</summary>'+slatePickReasons(c)+'</details></div>';
  });
  if (!visible.length) html = '<p class="slate-empty">'+(browsing ? 'No events match this search.' : 'No suggested picks fit the available budget. Browse events to choose a smaller buy-in, or adjust your limits.')+'</p>';
  document.getElementById('slate-event-list').innerHTML = html;
  document.getElementById('slate-pagination').innerHTML = list.length ? '<span>'+ (first+1)+'–'+Math.min(first+SLATE_PAGE_SIZE,list.length)+' of '+list.length+'</span>'+(pageCount>1 ? '<div><button class="sec-action" '+(draft.page===0 ? 'disabled ' : '')+'onclick="changeSlatePage(-1)">PREVIOUS</button><button class="sec-action" '+(draft.page===pageCount-1 ? 'disabled ' : '')+'onclick="changeSlatePage(1)">NEXT</button></div>' : '') : '';
}

function changeSlatePage(delta) { if (_slateDraft) { _slateDraft.page = Math.max(0,_slateDraft.page+delta); renderSlateEventList(); } }

function toggleSlateChoice(index,chosen) {
  if (!_slateDraft) return;
  _slateDraft.chosen[index] = chosen;
  if (chosen) _slateDraft.shortlist[index] = true;
  _slateDraft.message = '';
  // Keep the row in place when it is unchecked, including during keyboard use.
  var inputs = document.querySelectorAll('#slate-event-list input');
  inputs.forEach(function(input) { input.closest('.slate-choice').classList.toggle('is-selected',input.checked); });
  document.getElementById('slate-shortlist-tab').textContent = 'SHORTLIST ('+_slateDraft.shortlist.filter(Boolean).length+')';
  updateSlateSummary();
}

function clearSlateSelection() {
  if (!_slateDraft) return;
  _slateDraft.chosen = _slateDraft.chosen.map(function() { return false; });
  _slateDraft.message = '';
  renderSlateEventList(); updateSlateSummary();
}

function resetSlateSuggestions() {
  if (!_slateDraft) return;
  _slateDraft.chosen = _slateDraft.suggested.slice();
  _slateDraft.shortlist = _slateDraft.suggested.slice();
  _slateDraft.message = '';
  _slateDraft.view = 'shortlist'; _slateDraft.page = 0;
  renderSlateEventList(); updateSlateSummary();
}

function selectedSlatePicks() { return _slateDraft ? _slateDraft.result.candidates.filter(function(c,i) { return _slateDraft.chosen[i]; }) : []; }

function slateExtraEntryEstimate(plan,picks) {
  if (!_slatePreferences.history) return '';
  var ids = plan.pinned.map(function(t) { return t.id; });
  var events = plan.pinned.concat(picks.filter(function(c) { return ids.indexOf(c.event.id)<0; }).map(function(c) { return c.event; }));
  var history = PokerHQPlayerPlanning.profile(window.sessions,todayLocal()), extra = 0, count = 0;
  events.forEach(function(t) {
    var range = parseTourneyDateRange(t);
    if (!range) return;
    var estimate = PokerHQPlayerPlanning.assessment(t,{start:PokerHQSlate.normalizeDate(range.start),end:PokerHQSlate.normalizeDate(range.end)},history,{});
    if (estimate.cost>Number(t.buyin)) { extra += estimate.cost-Number(t.buyin); count++; }
  });
  return extra ? '<span class="slate-entry-estimate">Estimated extra entries: '+fmtCur(extra)+' for '+count+' event'+(count!==1?'s':'')+' with history · '+fmtCur(plan.reserve)+' reserved.</span>' : '';
}

function slateSelectionIssue(picks) {
  var plan = PokerHQPlanning.budget(window.tourneys,picks.map(function(c){return c.event;}),_slateDraft.options);
  if (plan.over) return 'The whole plan exceeds your budget, including existing stars, allowances and reserve.';
  if (plan.unknown) return 'A pinned event has no buy-in. Add its buy-in on the calendar before pinning this slate.';
  if (!picks.length) return 'Select an event to pin.';
  for (var i=0;i<picks.length;i++) for (var j=i+1;j<picks.length;j++) if (picks[i].date<=picks[j].endDate && picks[i].endDate>=picks[j].date) return 'These dates overlap. Uncheck one of the overlapping events.';
  var conflict = (window.tourneys || []).some(function(t) {
    if (!t.planning || picks.some(function(c) { return c.event.id===t.id; })) return false;
    var range = parseTourneyDateRange(t); if (!range) return false;
    var from = window.PokerHQSlate.normalizeDate(range.start), to = window.PokerHQSlate.normalizeDate(range.end);
    return picks.some(function(c) { return c.date<=to && c.endDate>=from; });
  });
  return conflict ? 'This overlaps an existing pinned event. Select it instead, or unpin it on the calendar.' : '';
}

function updateSlateSummary() {
  if (!_slateDraft) return;
  var picks = selectedSlatePicks(), spent = picks.reduce(function(n,c) { return n+c.buyin; },0), issue = slateSelectionIssue(picks);
  var plan = PokerHQPlanning.budget(window.tourneys,picks.map(function(c){return c.event;}),_slateDraft.options);
  document.getElementById('slate-summary').innerHTML = '<strong>'+picks.length+' selected · '+fmtCur(spent)+'</strong><span>'+fmtCur(plan.reserve)+' reserved · '+fmtCur(Math.max(0,plan.remaining))+' unallocated</span><span>Whole plan: '+fmtCur(plan.total)+' of '+fmtCur(_slateDraft.options.budget)+' · '+fmtCur(plan.committed)+' already pinned'+(plan.travel || plan.hotel ? ' · '+fmtCur(plan.travel+plan.hotel)+' travel / hotel' : '')+'</span>'+(issue || _slateDraft.message ? '<span class="'+(issue ? 'slate-issue' : 'slate-success')+'">'+esc(issue || _slateDraft.message)+'</span>' : '');
  document.getElementById('slate-apply').disabled = !!issue;
  document.getElementById('slate-summary').insertAdjacentHTML('beforeend',slateExtraEntryEstimate(plan,picks));
}

function applySlatePlan() {
  if (!_slateDraft) return;
  var picks = selectedSlatePicks(); if (slateSelectionIssue(picks)) return;
  var changed = [], live = window.tourneys || [];
  for (var i=0;i<picks.length;i++) {
    var t = live.find(function(e) { return e.id===picks[i].event.id; });
    if (!t || t.date!==picks[i].event.date || Number(t.buyin)!==picks[i].buyin || String(t.venue || '')!==String(picks[i].event.venue || '')) { invalidateSlateDraft('An event changed. Build the slate again before pinning.'); return; }
  }
  picks.forEach(function(c) { var t = live.find(function(e) { return e.id===c.event.id; }); if (!t.planning) { changed.push({id:t.id,planning:t.planning}); t.planning = true; } });
  save('tourneys',live); refreshSlateCalendar();
  _slateDraft.message = picks.length+' selected events are pinned on your calendar.';
  updateSlateSummary();
  if (changed.length) showUndoToast('Slate applied',function() {
    changed.forEach(function(c) { var t = (window.tourneys || []).find(function(e) { return e.id===c.id; }); if (t) t.planning = c.planning; });
    save('tourneys',window.tourneys); refreshSlateCalendar();
    if (_slateDraft) { _slateDraft.message = 'Pinning undone.'; updateSlateSummary(); }
  });
}

function refreshSlateCalendar() { renderCalendarMonth(); renderCalendarList(); if (typeof renderPlannedEvents==='function') renderPlannedEvents(); refreshDashboard(); }

function useBankrollForSlate() {
  var el = document.getElementById('slate-budget');
  if (el) el.value = Math.max(0,Math.round(Number(window.bankroll && window.bankroll.amount) || 0));
  invalidateSlateDraft('Budget filled. Choose your location and dates, then build the slate.');
}
