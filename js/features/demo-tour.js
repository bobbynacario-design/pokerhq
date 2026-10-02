var _demoTourStep=-1;
function demoShareUrl(){var url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('demo','1');return url.href;}
async function copyDemoLink(){try{await navigator.clipboard.writeText(demoShareUrl());showUndoToast('Demo link copied');}catch(e){prompt('Copy this demo link:',demoShareUrl());}}
function startDemoTour(){if(!window._demoMode)return;_demoTourStep=0;renderDemoTour();}
function closeDemoTour(){_demoTourStep=-1;renderDemoTour();}
function moveDemoTour(delta){_demoTourStep=Math.max(0,Math.min(2,_demoTourStep+delta));renderDemoTour();}
function renderDemoTour(){
  var el=document.getElementById('demo-tour');if(!el)return;el.hidden=!window._demoMode||_demoTourStep<0;
  if(el.hidden)return;var steps=[['Plan an event','Choose a location and budget, build a slate, then pin your selected events.','OPEN PLANNER'],['Capture a hand','Add one key decision to a sample session. Your notes stay in this demo.','CAPTURE A HAND'],['Review the run','Open a sample session debrief, replay a hand, and turn a lesson into a practice drill.','REVIEW A SESSION']],s=steps[_demoTourStep];
  el.innerHTML='<div><div class="surface-kicker">Demo tour · '+(_demoTourStep+1)+' of 3</div><strong>'+s[0]+'</strong><p>'+s[1]+'</p></div><div class="surface-actions"><button class="sec-action primary" onclick="demoTourAction()">'+s[2]+'</button>'+(_demoTourStep?'<button class="sec-action" onclick="moveDemoTour(-1)">BACK</button>':'')+'<button class="sec-action" onclick="'+(_demoTourStep===2?'closeDemoTour()':'moveDemoTour(1)')+'">'+(_demoTourStep===2?'FINISH TOUR':'NEXT')+'</button><button class="sec-action" onclick="copyDemoLink()">COPY DEMO LINK</button><button class="sec-action" onclick="closeDemoTour()">CLOSE TOUR</button></div>';
}
function demoTourAction(){if(!window._demoMode)return;if(_demoTourStep===0)switchGroup('plan','calendar');else if(sessions.length){if(_demoTourStep===1)openHandModalForSession(sessions[0].id);else viewSessionDetail(sessions[0].id);}}
function startLinkedDemo(){if(new URLSearchParams(location.search).get('demo')==='1'){loadDemoMode(true);startDemoTour();}}
