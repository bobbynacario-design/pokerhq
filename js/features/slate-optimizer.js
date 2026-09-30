var _slateDraft = null;
function invalidateSlateDraft(){_slateDraft=null;var out=document.getElementById('slate-results');if(out)out.innerHTML='<div class="tip">Limits changed. Build the slate again.</div>';}
function renderSlateOptimizer() {
  var out=document.getElementById('slate-results');if(!out||!window.PokerHQSlate)return;
  _slateDraft=null;
  var budget=Number(document.getElementById('slate-budget').value),maxBuyin=Number(document.getElementById('slate-max-buyin').value)||budget,reserve=Number(document.getElementById('slate-reserve').value)||0;
  var from=document.getElementById('slate-from').value||todayLocal(),to=document.getElementById('slate-to').value;
  if(!isFinite(budget)||!isFinite(maxBuyin)||!isFinite(reserve)||budget<=0||maxBuyin<=0||reserve<0||reserve>=budget){out.innerHTML='<div class="tip">Enter a positive budget and buy-in cap, with a reserve smaller than the budget.</div>';return;}
  if(to&&to<from){out.innerHTML='<div class="tip">The end date must be on or after the start date.</div>';return;}
  var events=(window.tourneys||[]).map(function(t){return Object.assign({},t,{status:typeof gradeBuyin==='function'?gradeBuyin(t.buyin):t.status});});
  var result=window.PokerHQSlate.optimize(events,{budget:budget,maxBuyin:maxBuyin,reserve:reserve,from:from,to:to,dateRange:typeof parseTourneyDateRange==='function'?parseTourneyDateRange:null});
  if(!result.selected.length){out.innerHTML='<div class="tip">No dated events fit these limits. Try a wider date range or buy-in cap.</div>';return;}
  _slateDraft={result:result,chosen:result.candidates.map(function(c){return result.selected.indexOf(c)!==-1;})};
  out.innerHTML='<div class="tip">Suggested picks use bankroll fit, guarantees and your ★ stars. Keep one event per day; multi-day events reserve their full date range. Applying adds stars and keeps your existing plans.</div><div id="slate-summary" class="tip" role="status"></div>'+result.candidates.map(function(c,i){
    return '<label class="slate-choice"><input type="checkbox" aria-label="Select '+esc(c.event.name||'Tournament')+'" '+(_slateDraft.chosen[i]?'checked ':'')+'onchange="toggleSlateChoice('+i+',this.checked)"><span class="slate-choice-main"><strong>'+esc(c.event.name||'Tournament')+'</strong><span>'+esc(c.event.date)+' · '+esc(c.event.venue||'Venue TBD')+'</span></span><span>'+fmtCur(c.buyin)+'</span></label>';
  }).join('')+'<button class="sec-action primary" id="slate-apply" onclick="applySlatePlan()">APPLY / PIN SELECTED EVENTS</button>';
  updateSlateSummary();
}
function toggleSlateChoice(index,chosen){if(!_slateDraft)return;_slateDraft.chosen[index]=chosen;updateSlateSummary();}
function selectedSlatePicks(){return _slateDraft ? _slateDraft.result.candidates.filter(function(c,i){return _slateDraft.chosen[i];}) : [];}
function slateSelectionIssue(picks){
  if(!picks.length)return 'Select at least one event.';
  if(picks.reduce(function(n,c){return n+c.buyin;},0)>_slateDraft.result.available)return 'Selected buy-ins exceed your budget after the reserve.';
  for(var i=0;i<picks.length;i++)for(var j=i+1;j<picks.length;j++)if(picks[i].date<=picks[j].endDate&&picks[i].endDate>=picks[j].date)return 'These dates overlap. Select one event per day.';
  var conflict=(window.tourneys||[]).some(function(t){
    if(!t.planning||picks.some(function(c){return c.event.id===t.id;}))return false;
    var range=parseTourneyDateRange(t);if(!range)return false;
    var from=window.PokerHQSlate.normalizeDate(range.start),to=window.PokerHQSlate.normalizeDate(range.end);
    return picks.some(function(c){return c.date<=to&&c.endDate>=from;});
  });
  if(conflict)return 'This overlaps an existing pinned event. Select it instead, or unpin it on the calendar.';
  return '';
}
function updateSlateSummary(){
  var picks=selectedSlatePicks(),spent=picks.reduce(function(n,c){return n+c.buyin;},0),issue=slateSelectionIssue(picks);
  document.getElementById('slate-summary').textContent=picks.length+' events · '+fmtCur(spent)+' selected · '+fmtCur(_slateDraft.result.reserve)+' reserved · '+fmtCur(Math.max(0,_slateDraft.result.available-spent))+' unallocated.'+(issue?' '+issue:'');
  document.getElementById('slate-apply').disabled=!!issue;
}
function applySlatePlan(){
  if(!_slateDraft)return;
  var picks=selectedSlatePicks();if(slateSelectionIssue(picks))return;
  var changed=[],live=window.tourneys||[];
  for(var i=0;i<picks.length;i++){
    var t=live.find(function(e){return e.id===picks[i].event.id;});
    if(!t||t.date!==picks[i].event.date||Number(t.buyin)!==picks[i].buyin){document.getElementById('slate-summary').textContent='An event changed. Build the slate again before applying.';return;}
  }
  picks.forEach(function(c){var t=live.find(function(e){return e.id===c.event.id;});if(!t.planning){changed.push({id:t.id,planning:t.planning});t.planning=true;}});
  save('tourneys',live);refreshSlateCalendar();
  document.getElementById('slate-summary').textContent=picks.length+' selected events are pinned on your calendar.';
  if(changed.length)showUndoToast('Slate applied',function(){changed.forEach(function(c){var t=(window.tourneys||[]).find(function(e){return e.id===c.id;});if(t)t.planning=c.planning;});save('tourneys',window.tourneys);refreshSlateCalendar();});
}
function refreshSlateCalendar(){renderCalendarMonth();renderCalendarList();if(typeof renderPlannedEvents==='function')renderPlannedEvents();refreshDashboard();}
function useBankrollForSlate(){var el=document.getElementById('slate-budget');if(el)el.value=Math.max(0,Math.round(Number(window.bankroll&&window.bankroll.amount)||0));renderSlateOptimizer();}
