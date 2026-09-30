var _practiceSeed=null;
function practiceState(){return PokerHQDrills.normalizeState(window.drillState||{});}
function savePracticeState(state){window.drillState=state;save('drillState',state);renderPracticeDrills();if(typeof renderDailyDrill==='function')renderDailyDrill();}
function openPracticeFromHand(id){
  var h=hands.find(function(t){return t.id===id;});if(!h)return;
  _practiceSeed={id:'hand-'+id,sourceHandId:id,title:h.title||'Hand practice',prompt:(h.lesson||'Replay the key decision from this hand.')+'\nBefore checking the result, write your action and why. Compare it with an alternative line; note one adjustment for your next session.'};
  closeModal('modal-hand-replay');openPracticeDraft();
}
function openPracticeFromLeak(key){var item=inboxItem(key);if(!item)return;_practiceSeed={id:'leak-'+item.ref,sourceTag:String(item.ref).replace(/^tag:/,''),title:item.title,prompt:item.detail+'\nPick three recent hands with this tag. For each, write the trigger, a better decision and one rule to use next session.'};openPracticeDraft();}
function openPracticeDraft(){var saved=(practiceState().practice||[]).find(function(p){return p.id===_practiceSeed.id;});document.getElementById('practice-title').value=saved?saved.title:_practiceSeed.title;document.getElementById('practice-prompt').value=saved?saved.prompt:_practiceSeed.prompt;document.getElementById('practice-error').textContent='';openModal('modal-practice');}
function savePracticeDraft(){
  if(!_practiceSeed)return;var title=document.getElementById('practice-title').value.trim(),prompt=document.getElementById('practice-prompt').value.trim();
  if(!title||!prompt){document.getElementById('practice-error').textContent='Add a title and practice instructions.';return;}
  var s=practiceState();s.practice=s.practice||[];var previous=s.practice.find(function(p){return p.id===_practiceSeed.id;});
  var record=Object.assign({},_practiceSeed,{title:title,prompt:prompt,createdAt:previous?previous.createdAt:Date.now(),days:previous?previous.days:[]});
  s.practice=s.practice.filter(function(p){return p.id!==record.id;}).concat([record]);savePracticeState(s);closeModal('modal-practice');switchGroup('improve','strategy');
}
function togglePracticeDay(id){var s=practiceState();var p=(s.practice||[]).find(function(x){return x.id===id;});if(!p)return;var today=todayLocal();p.days=p.days.indexOf(today)>=0?p.days.filter(function(d){return d!==today;}):p.days.concat([today]).sort();savePracticeState(s);}
function deletePracticeDrill(id){var s=practiceState(),p=(s.practice||[]).find(function(x){return x.id===id;});if(!p)return;s.practice=s.practice.filter(function(x){return x.id!==id;});savePracticeState(s);showUndoToast('Practice drill removed',function(){var state=practiceState();state.practice=(state.practice||[]).filter(function(x){return x.id!==id;}).concat([p]);savePracticeState(state);});}
function renderPracticeDrills(){
  var el=document.getElementById('practice-drills-wrap');if(!el)return;var drills=practiceState().practice||[];
  el.innerHTML='<details class="disclosure" '+(drills.length?'open':'')+'><summary>Your practice drills · '+drills.length+'</summary><div class="disclosure-body"><p class="slate-intro">Turn a hand replay or recurring leak from Review Inbox into practice. Mark the days you work on it.</p>'+drills.map(function(p){
    var safe=esc(p.id),exists=hands.some(function(h){return h.id===p.sourceHandId;});
    return '<div class="review-card practice-card"><h3>'+esc(p.title)+'</h3><p class="cleanup-notes">'+esc(p.prompt)+'</p><p>'+p.days.length+' practice day'+(p.days.length===1?'':'s')+(p.days.length?' · Last: '+esc(p.days[p.days.length-1]):' · Ready to begin')+'</p><div class="surface-actions"><button class="sec-action primary" onclick="togglePracticeDay(\''+safe+'\')">'+(p.days.indexOf(todayLocal())>=0?'✓ PRACTICED TODAY · UNDO':'PRACTICED TODAY')+'</button>'+(exists?'<button class="sec-action" onclick="openHandReplay('+p.sourceHandId+')">OPEN SOURCE HAND</button>':'')+'<button class="sec-action" onclick="deletePracticeDrill(\''+safe+'\')">REMOVE DRILL</button></div></div>';
  }).join('')+'</div></details>';
}
