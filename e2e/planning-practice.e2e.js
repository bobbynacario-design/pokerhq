'use strict';
const assert=require('node:assert/strict');const {boot,out}=require('./lib.js');
(async()=>{
  for(const width of [1280,390]){
    const app=await boot({viewport:{width,height:900}});const {page}=app;
    try{
      await page.evaluate(()=>{window.bankroll.amount=20000;window.tourneys=[
        {id:1,name:'Metro Main',date:'2026-10-03',venue:'Metro Card Club',buyin:6000,planning:true},
        {id:2,name:'Okada Sunday Main',date:'2026-10-04',venue:'Okada Manila',buyin:3000,gtd:'1M'},
        {id:3,name:'Okada Monday Side',date:'2026-10-05',venue:'Okada Manila',buyin:1000}
      ];syncGlobalAliases();switchGroup('plan','calendar');});
      await page.selectOption('#slate-location','okada');await page.fill('#slate-budget','12000');
      await page.fill('#slate-from','2026-10-01');await page.fill('#slate-to','2026-10-10');
      await page.locator('#slate-limits > summary').click();
      for(const [id,value] of [['reserve','1000'],['travel','500'],['hotel','1500']])await page.fill('#slate-'+id,value);
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      assert.match(await page.locator('#slate-summary').innerText(),/₱6,000 already pinned/);
      assert.match(await page.locator('#slate-summary').innerText(),/Whole plan: ₱12,000 of ₱12,000/);
      await page.click('#slate-browse-tab');await page.getByLabel('Select Okada Monday Side',{exact:true}).check();
      assert.equal(await page.locator('#slate-apply').isEnabled(),false,'other venue pins and trip allowances protect the whole budget');
      await page.getByLabel('Select Okada Monday Side',{exact:true}).uncheck();await page.click('#slate-apply');
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id)),[1,2]);
      assert.match(await page.locator('#slate-summary').innerText(),/Whole plan: ₱12,000 of ₱12,000/,'newly pinned selection is counted only once');
      await page.evaluate(()=>undoLastDelete());
      await page.evaluate(()=>{window.tourneys=[
        {id:11,name:'Okada Main Event',date:'2026-10-03',venue:'Okada Manila',buyin:3000,notes:'First source',gtd:'1M'},
        {id:12,name:'Okada — Main Event',date:'October 3, 2026',venue:'PokerStars LIVE Manila at Okada Manila',buyin:3000,planning:true,notes:'Second source',time:'12:00'},
        {id:13,name:'Main Event Flight A',date:'2026-10-04',venue:'Okada Manila',buyin:3000},
        {id:14,name:'Main Event Flight B',date:'2026-10-04',venue:'Okada Manila',buyin:3000}
      ];syncGlobalAliases();renderCalendar();});
      await page.getByRole('button',{name:'REVIEW DUPLICATES',exact:true}).click();
      assert.match(await page.locator('#cleanup-body').innerText(),/1 likely duplicate pair/);
      await page.getByRole('button',{name:'PREVIEW MERGE',exact:true}).click();
      await page.selectOption('#cleanup-keep','11');
      assert.match(await page.locator('#cleanup-body').innerText(),/First source\nSecond source/);
      assert.match(await page.locator('#cleanup-body').innerText(),/Pinned/);
      await page.getByRole('button',{name:'MERGE THESE TWO',exact:true}).click();
      assert.equal(await page.evaluate(()=>tourneys.length),3);assert.equal(await page.evaluate(()=>tourneys.find(t=>t.id===11).planning),true);
      await page.evaluate(()=>undoLastDelete());assert.equal(await page.evaluate(()=>tourneys.length),4);
      await page.locator('#modal-calendar-cleanup').getByRole('button',{name:'CLOSE',exact:true}).click();
      await page.evaluate(()=>{window.hands=[{id:41,title:'Thin river call',desc:'Called a large bet with one pair',lesson:'Compare value and bluff combinations',tags:['tilt'],sessionId:51}];window.sessions=[{id:51,name:'Sample',date:todayLocal(),total:1000,prize:0,pnl:-1000}];syncGlobalAliases();save('hands',hands);save('sessions',sessions);openHandReplay(41);});
      await page.getByRole('button',{name:'CREATE PRACTICE DRILL',exact:true}).click();
      await page.fill('#practice-title','River range practice');await page.getByRole('button',{name:'SAVE PRACTICE DRILL',exact:true}).click();
      await page.getByRole('button',{name:'PRACTICED TODAY',exact:true}).click();
      assert.match(await page.locator('#practice-drills-wrap').innerText(),/1 practice day/);
      await page.evaluate(()=>drillDone());
      await page.reload();await page.waitForFunction(()=>typeof window.__authCallback==='function');
      await page.evaluate(()=>{__authCallback({uid:'u1',email:'bobbynacario@gmail.com'});switchGroup('improve','strategy');});
      await page.waitForFunction(()=>document.getElementById('practice-drills-wrap').textContent.includes('River range practice'));
      assert.match(await page.locator('#practice-drills-wrap').innerText(),/1 practice day/);
      await page.getByRole('button',{name:'✓ PRACTICED TODAY · UNDO',exact:true}).click();
      assert.match(await page.locator('#practice-drills-wrap').innerText(),/0 practice days/);
      await page.locator('#practice-drills-wrap').screenshot({path:out('practice-drills-'+width+'.png')});
      await page.evaluate(()=>{hands.push({id:Date.now()-2,title:'Tilt two',sessionId:51,tags:['tilt']},{id:Date.now()-1,title:'Tilt three',sessionId:51,tags:['tilt']});refreshInboxNow();switchGroup('review','inbox');});
      await page.locator('.inbox-row[data-key^="leak:"]').getByRole('button',{name:'CREATE PRACTICE DRILL',exact:true}).click();
      assert.match(await page.locator('#practice-title').inputValue(),/tilt keeps recurring/);
      await page.getByRole('button',{name:'SAVE PRACTICE DRILL',exact:true}).click();
      assert.equal(await page.evaluate(()=>drillState.practice.length),2);
      await page.evaluate(()=>{replaceActiveSessionDraft({name:'Blind clock test',date:todayLocal()});switchGroup('play','sessions');});
      await page.locator('.live-clock-panel > summary').click();
      for(const [id,value] of [['minutes','1'],['bigBlind','400'],['chips','20000'],['breakMinutes','1']]){await page.fill('#lc-'+id,value);await page.locator('#lc-'+id).press('Tab');if(id==='bigBlind')assert.equal(await page.evaluate(()=>document.activeElement.id),'lc-chips');}
      assert.match(await page.locator('#live-stack-bb').innerText(),/50 BB/);
      await page.getByRole('button',{name:'START LEVEL CLOCK',exact:true}).click();
      await page.evaluate(()=>{_activeSessionDraft.liveClock.startedAt=Date.now()-61000;persistActiveSessionDraft();});
      assert.match(await page.locator('#live-level-time').innerText(),/Level complete/);assert.match(await page.locator('#live-break-note').innerText(),/Break reminder/);
      await page.getByRole('button',{name:'PAUSE LEVEL',exact:true}).click();
      await page.getByRole('button',{name:'NEXT LEVEL',exact:true}).click();
      assert.match(await page.locator('#live-level-time').innerText(),/Level 2 · 1:00/);
      await page.getByRole('button',{name:'BREAK TAKEN',exact:true}).click();
      assert.doesNotMatch(await page.locator('#live-break-note').innerText(),/Break reminder —/);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.locator('.live-clock-panel').screenshot({path:out('live-clock-'+width+'.png')});
      await page.reload();await page.waitForFunction(()=>typeof window.__authCallback==='function');await page.evaluate(()=>{__authCallback({uid:'u1',email:'bobbynacario@gmail.com'});switchGroup('play','sessions');});
      await page.waitForSelector('#live-stack-bb');assert.match(await page.locator('#live-stack-bb').innerText(),/50 BB/);assert.match(await page.locator('#live-level-time').innerText(),/Level 2/);
      assert.deepEqual(app.realErrors(),[]);console.log('ok '+width+'px whole budget, merge preview/undo, distinct flights, saved practice/reload and blind clocks');
    }finally{await app.close();}
  }
  const guest=await boot({signedIn:false,viewport:{width:390,height:844}});
  try{
    const {page}=guest;await page.goto('http://127.0.0.1:'+guest.port+'/index.html?demo=1');
    await page.waitForFunction(()=>window._demoMode===true);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'demo header and tour fit a phone');
    await page.locator('#demo-tour').screenshot({path:out('direct-demo-tour-390.png')});
    assert.equal(await page.locator('#login-overlay').isVisible(),false);
    assert.equal(guest.dialogs.length,0,'direct demo does not ask for sign-in or confirmation');
    await page.evaluate(()=>__authCallback(null));assert.equal(await page.locator('#login-overlay').isVisible(),false);
    await page.getByRole('button',{name:'OPEN PLANNER',exact:true}).click();assert.equal(await page.locator('#slate-location').isVisible(),true);
    await page.getByRole('button',{name:'NEXT',exact:true}).click();await page.getByRole('button',{name:'CAPTURE A HAND',exact:true}).click();
    assert.equal(await page.locator('#modal-hand').isVisible(),true);await page.locator('#modal-hand').getByRole('button',{name:'CANCEL',exact:true}).click();
    await page.getByRole('button',{name:'NEXT',exact:true}).click();await page.getByRole('button',{name:'REVIEW A SESSION',exact:true}).click();
    assert.equal(await page.locator('#modal-session-detail').isVisible(),true);
    await page.evaluate(()=>closeModal('modal-session-detail'));await page.getByRole('button',{name:'FINISH TOUR',exact:true}).click();
    assert.equal(await page.locator('#demo-tour').isVisible(),false);assert.deepEqual(guest.realErrors(),[]);
    assert.equal(await page.evaluate(()=>__cloud.stats.sets+__cloud.stats.transactions),0);
    console.log('ok direct demo and guided tour stay in memory without cloud writes');
  }finally{await guest.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
