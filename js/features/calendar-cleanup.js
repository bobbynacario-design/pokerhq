var _cleanupPair = null;
var _cleanupBatch = null;
function calendarCleanupPlan(){
  var preferred=[];
  if(_activeSessionDraft&&_activeSessionDraft.tourneyId!=null)preferred.push(_activeSessionDraft.tourneyId);
  (window.sessions||[]).forEach(function(s){if(s.tourneyId!=null&&preferred.indexOf(s.tourneyId)<0)preferred.push(s.tourneyId);});
  return PokerHQPlanning.cleanup(window.tourneys,parseTourneyDateRange,preferred);
}
function openCalendarCleanup(){
  _cleanupPair=null;_cleanupBatch=null;
  var pairs=PokerHQPlanning.duplicates(window.tourneys,parseTourneyDateRange);
  var batch=calendarCleanupPlan();
  var body=document.getElementById('cleanup-body');
  body.innerHTML=pairs.length ? '<p class="slate-intro">'+pairs.length+' likely duplicate pair'+(pairs.length===1?'':'s')+'. Different flights, start times or buy-ins are kept separate.</p>'+(batch.removed?'<div class="review-card"><strong>'+batch.removed+' extra entr'+(batch.removed===1?'y':'ies')+' in '+batch.groups.length+' duplicate group'+(batch.groups.length===1?'':'s')+'</strong><p>Keep one event per group. Pins, notes and sources are combined. Undo is available.</p><button class="sec-action primary" onclick="previewCalendarBatch()">REMOVE ALL DUPLICATES</button></div>':'')+'<details class="cleanup-pairs"><summary>Review individual pairs ('+pairs.length+')</summary>'+pairs.map(function(pair){
    return '<div class="review-card"><strong>'+esc(pair[0].name)+'</strong><p>'+esc(pair[1].name)+' · '+esc(pair[0].date)+' · '+esc(PokerHQStats.placeOf(pair[0].venue).label)+'</p><button class="sec-action" onclick="previewCalendarMerge('+pair[0].id+','+pair[1].id+')">PREVIEW MERGE</button></div>';
  }).join('')+'</details>' : '<p class="slate-intro">No likely duplicates found. Your calendar entries are kept as they are.</p>';
  openModal('modal-calendar-cleanup');
}
function previewCalendarBatch(){
  var plan=calendarCleanupPlan();if(!plan.removed){openCalendarCleanup();return;}
  _cleanupPair=null;
  _cleanupBatch={plan:plan,original:JSON.stringify(window.tourneys)};
  document.getElementById('cleanup-body').innerHTML='<div class="review-card"><h3>Remove '+plan.removed+' duplicate entr'+(plan.removed===1?'y':'ies')+'?</h3><p>'+plan.groups.length+' event'+(plan.groups.length===1?'':'s')+' will remain, one per duplicate group. Different flights, start times and buy-ins stay separate.</p><p>Pins, notes, sources and session links are preserved. You can undo the whole batch.</p></div><details class="cleanup-pairs"><summary>See the events being kept ('+plan.groups.length+')</summary>'+plan.groups.map(function(g){
    return '<div class="review-card"><strong>'+esc(g.merged.name)+'</strong><p>'+esc(g.merged.date)+' · '+esc(g.merged.venue)+'</p><p>'+g.originals.length+' copies → 1 event'+(g.merged.planning?' · ★ Pinned':'')+'</p></div>';
  }).join('')+'</details><div class="surface-actions"><button class="sec-action" onclick="openCalendarCleanup()">BACK</button><button class="sec-action primary" onclick="applyCalendarBatch()">REMOVE '+plan.removed+' DUPLICATE'+(plan.removed===1?'':'S')+'</button></div>';
}
function applyCalendarBatch(){
  if(!_cleanupBatch)return;
  if(JSON.stringify(window.tourneys)!==_cleanupBatch.original){previewCalendarBatch();document.getElementById('cleanup-body').insertAdjacentHTML('afterbegin','<p class="slate-intro" role="status">Your calendar changed. The batch preview has been refreshed; check the new count before removing.</p>');return;}
  var plan=_cleanupBatch.plan,originals=JSON.parse(_cleanupBatch.original),links=[],draftLink=null,mergedState=new Map();
  plan.groups.forEach(function(g){mergedState.set(g.merged.id,JSON.stringify(g.merged));});
  function newId(id){var link=plan.remap.find(function(r){return r.from===id;});return link?link.to:id;}
  window.sessions=sessions=(window.sessions||[]).map(function(s){var id=newId(s.tourneyId);if(id===s.tourneyId)return s;links.push({id:s.id,from:s.tourneyId,to:id});return Object.assign({},s,{tourneyId:id});});
  if(_activeSessionDraft&&newId(_activeSessionDraft.tourneyId)!==_activeSessionDraft.tourneyId){draftLink={key:_activeSessionDraft.key,from:_activeSessionDraft.tourneyId,to:newId(_activeSessionDraft.tourneyId)};_activeSessionDraft.tourneyId=draftLink.to;}
  window.tourneys=tourneys=plan.events;
  if(draftLink)persistActiveSessionDraft();
  save('tourneys',tourneys);if(links.length)save('sessions',sessions);
  invalidateSlateDraft();renderCalendar();refreshDashboard();closeModal('modal-calendar-cleanup');_cleanupBatch=null;
  showUndoToast('Removed '+plan.removed+' duplicate entr'+(plan.removed===1?'y':'ies'),function(){
    var safe=plan.groups.every(function(g){var current=tourneys.find(function(t){return t.id===g.merged.id;});return current&&JSON.stringify(current)===mergedState.get(g.merged.id)&&g.originals.every(function(t){return t.id===g.merged.id||!tourneys.some(function(x){return x.id===t.id;});});});
    if(!safe){alert('A cleaned-up event changed. Undo is unavailable so those edits stay safe.');return;}
    var affected=new Set();plan.groups.forEach(function(g){g.originals.forEach(function(t){affected.add(t.id);});});
    var restored=tourneys.filter(function(t){return !affected.has(t.id);});
    originals.forEach(function(t,i){if(affected.has(t.id))restored.splice(Math.min(i,restored.length),0,t);});
    window.tourneys=tourneys=restored;
    var changed=false;window.sessions=sessions=sessions.map(function(s){var link=links.find(function(l){return l.id===s.id&&l.to===s.tourneyId;});if(!link)return s;changed=true;return Object.assign({},s,{tourneyId:link.from});});
    if(draftLink&&_activeSessionDraft&&_activeSessionDraft.key===draftLink.key&&_activeSessionDraft.tourneyId===draftLink.to){_activeSessionDraft.tourneyId=draftLink.from;persistActiveSessionDraft();}
    save('tourneys',tourneys);if(changed)save('sessions',sessions);invalidateSlateDraft();renderCalendar();refreshDashboard();openCalendarCleanup();
  },30000);
}
function previewCalendarMerge(first,second,keepId){
  var a=tourneys.find(function(t){return t.id===first;}),b=tourneys.find(function(t){return t.id===second;});if(!a||!b){openCalendarCleanup();return;}
  var keep=keepId===b.id?b:keepId===a.id?a:b.planning&&!a.planning?b:a,other=keep===a?b:a;
  _cleanupPair={first:first,second:second,keep:keep.id,original:JSON.stringify([a,b])};
  var merged=PokerHQPlanning.merge(keep,other);
  document.getElementById('cleanup-body').innerHTML='<p class="slate-intro">Choose the entry to keep. Its name stays; stars and complementary details from both entries are combined.</p><div class="form-group"><label class="form-label" for="cleanup-keep">Keep this entry</label><select class="form-input" id="cleanup-keep" onchange="previewCalendarMerge('+a.id+','+b.id+',Number(this.value))">'+[a,b].map(function(t){return '<option value="'+t.id+'" '+(t.id===keep.id?'selected':'')+'>'+esc(t.name)+'</option>';}).join('')+'</select></div><div class="review-card"><h3>Merged preview</h3><strong>'+esc(merged.name)+'</strong><p>'+esc(merged.date)+' · '+esc(merged.venue)+' · '+fmtCur(merged.buyin)+'</p><p>'+esc(merged.time||'No start time')+' · '+(merged.planning?'★ Pinned':'Unpinned')+' · '+esc(merged.gtd||'No guarantee recorded')+'</p><p class="cleanup-notes">'+esc(merged.notes||'No notes')+'</p><p>'+esc((merged.source||'')+(merged.url?' · '+merged.url:''))+'</p></div><div class="surface-actions"><button class="sec-action" onclick="openCalendarCleanup()">BACK</button><button class="sec-action primary" onclick="applyCalendarMerge()">MERGE THESE TWO</button></div>';
}
function applyCalendarMerge(){
  if(!_cleanupPair)return;var pair=_cleanupPair,a=tourneys.find(function(t){return t.id===pair.first;}),b=tourneys.find(function(t){return t.id===pair.second;});
  if(!a||!b||JSON.stringify([a,b])!==pair.original){openCalendarCleanup();alert('An entry changed. Review the new details before merging.');return;}
  var originals=[Object.assign({},a),Object.assign({},b)],keep=pair.keep===a.id?a:b,other=keep===a?b:a,merged=PokerHQPlanning.merge(keep,other);
  window.tourneys=tourneys=tourneys.filter(function(t){return t.id!==other.id;}).map(function(t){return t.id===keep.id?merged:t;});
  save('tourneys',tourneys);invalidateSlateDraft();renderCalendar();refreshDashboard();openCalendarCleanup();
  showUndoToast('Calendar entries merged',function(){
    var current=tourneys.find(function(t){return t.id===keep.id;});
    if(!current||JSON.stringify(current)!==JSON.stringify(merged)){alert('The merged entry changed. Undo is unavailable so those edits stay safe.');return;}
    window.tourneys=tourneys=tourneys.filter(function(t){return t.id!==keep.id&&t.id!==other.id;}).concat(originals);save('tourneys',tourneys);invalidateSlateDraft();renderCalendar();refreshDashboard();openCalendarCleanup();
  });
}
