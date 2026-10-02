'use strict';
const assert = require('node:assert/strict');
const {boot,out,OWNER} = require('./lib.js');
(async()=>{
  for (const width of [1280,390]) {
    const app=await boot({viewport:{width,height:1000}}), {page}=app;
    try {
      await page.evaluate(async()=>{
        window.bankroll.amount=30000; window.bankroll.rule=5;
        window.sessions=Array.from({length:3},(_,i)=>({id:100+i,name:'Past Turbo '+(i+1),date:'2026-09-0'+(i+1),venue:i%2?'PokerStars LIVE Manila at Okada Manila':'Okada Manila',structure:'Turbo',buyin:3000,total:6000,hours:6,prize:0,pnl:-6000,notes:''}));
        window.tourneys=[
          {id:2,name:'Metro Regular',venue:'Metro Card Club',date:'2026-10-03',structure:'Regular',buyin:3000},
          {id:1,name:'Okada Turbo',venue:'Okada Manila',date:'2026-10-03',structure:'Turbo',buyin:3000},
          {id:3,name:'Sunday Turbo',venue:'Okada Manila',date:'2026-10-04',structure:'Turbo',buyin:3000},
          {id:9,name:'Already planned',venue:'Metro Card Club',date:'2026-10-10',buyin:10000,planning:true}
        ];syncGlobalAliases();
        await Promise.all(['bankroll','sessions','tourneys'].map(k=>fbSave(k,window[k])));
        switchGroup('plan','calendar');
      });
      await page.selectOption('#slate-location','*'); await page.fill('#slate-budget','16000');
      await page.fill('#slate-from','2026-10-01'); await page.fill('#slate-to','2026-10-20');
      const build=()=>page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      await build();
      assert.deepEqual(await page.evaluate(()=>selectedSlatePicks().map(c=>c.event.id).sort((a,b)=>a-b)),[1,3,9]);
      assert.match(await page.locator('#slate-summary').innerText(),/Estimated extra entries: ₱6,000 for 2 events with history/);
      const turbo=page.locator('.slate-candidate').filter({has:page.getByLabel('Select Okada Turbo',{exact:true})});
      assert.equal(await turbo.locator('.slate-why').evaluate(e=>e.open),false);
      await turbo.locator('summary').click();
      assert.match(await turbo.innerText(),/Typical entry spend: ₱6,000 · 3 venue \+ format sessions · limited sample/);
      assert.match(await turbo.innerText(),/Typical session: 6 hours/);
      assert.equal(await turbo.locator('input').isChecked(),true,'opening reasons never changes a selection');
      await page.locator('#slate-optimizer-card').screenshot({path:out('personal-planner-'+width+'.png'),style:'.mobile-nav,.mobile-subtab-strip{visibility:hidden}'});
      await page.click('#privacy-toggle');
      await page.waitForFunction(()=>!PokerHQPrivacy.hasMoney(document.getElementById('slate-summary').innerText) && !PokerHQPrivacy.hasMoney(document.querySelector('#slate-event-list .slate-why[open]').innerText));
      await page.click('#privacy-toggle');
      await page.waitForFunction(()=>document.querySelector('.slate-entry-estimate').innerText.includes('₱6,000'));

      await page.locator('#slate-personalize > summary').click();
      await page.fill('#slate-max-hours','4'); await build();
      await page.click('#slate-browse-tab');
      assert.equal(await page.getByLabel('Select Okada Turbo',{exact:true}).count(),0);
      assert.equal(await page.getByLabel('Select Metro Regular',{exact:true}).count(),1,'unknown schedule remains reviewable');
      await page.fill('#slate-max-hours','');
      for (const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']) await page.getByLabel('Available '+day,{exact:true}).uncheck();
      await build();
      assert.deepEqual(await page.evaluate(()=>_slateDraft.result.candidates.map(c=>c.event.id).sort((a,b)=>a-b)),[3,9]);
      const pinned=page.locator('.slate-candidate').filter({has:page.getByLabel('Select Already planned',{exact:true})});
      await pinned.locator('summary').click(); assert.match(await pinned.innerText(),/Outside your day\/time preferences/);
      await page.getByLabel('Available Sunday',{exact:true}).uncheck(); await build();
      assert.match(await page.locator('#slate-results').innerText(),/Choose at least one available day/);
      await page.getByLabel('Available Saturday',{exact:true}).check(); await page.getByLabel('Available Sunday',{exact:true}).check();
      await page.selectOption('#slate-preferred-format','Regular'); await build();
      assert.deepEqual(await page.evaluate(()=>selectedSlatePicks().map(c=>c.event.id).sort((a,b)=>a-b)),[2,3,9]);
      await page.click('#slate-apply');
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id).sort((a,b)=>a-b)),[2,3,9]);

      await page.evaluate(async()=>{
        var today=todayLocal(), tomorrow=new Date(today+'T12:00:00'); tomorrow.setDate(tomorrow.getDate()+1);
        window.bankroll.amount=20000;window.tourneys=[
          {id:21,name:'Playing now',date:today,venue:'Okada Manila',buyin:3000,planning:true},
          {id:22,name:'Next planned event',date:todayLocal(tomorrow),venue:'Metro Card Club',buyin:10000,planning:true}
        ];syncGlobalAliases();await Promise.all(['bankroll','tourneys'].map(k=>fbSave(k,window[k])));renderCalendar();
      });
      await page.locator('.planned-start').click();
      await page.locator('#modal-readiness').waitFor({state:'visible'});
      await page.getByRole('button',{name:'SKIP',exact:true}).click();
      const guard=page.locator('#play-active-session-wrap .reentry-guard');
      assert.match(await guard.innerText(),/₱10,000 protected for 1 upcoming event/);
      assert.match(await guard.innerText(),/Bankroll left after next bullet: ₱4,000/);
      await guard.locator('summary').click(); await page.fill('#guard-play-cap','5000'); await page.fill('#guard-play-nextCost','2000');
      await page.press('#guard-play-nextCost','Tab'); assert.equal(await page.evaluate(()=>document.activeElement.id),'guard-play-cap','changing a guard field keeps keyboard focus');
      const plus=()=>page.locator('#play-active-session-wrap .counter-btn').filter({hasText:'+'}).click();
      await plus(); assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),2); assert.equal(await page.inputValue('#s-rebuy'),'2000');
      await page.fill('#guard-play-nextCost','2500'); await plus();
      assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),2,'crossing a cap requires review first');
      assert.match(await guard.innerText(),/exceeds your ₱5,000 session cap by ₱2,500/);
      await guard.getByRole('button',{name:'CANCEL',exact:true}).click(); assert.equal(await guard.locator('.guard-review').count(),0);
      await page.fill('#guard-play-cap','8000'); await page.fill('#guard-play-protect','1000'); await plus();
      assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),3); assert.equal(await page.inputValue('#s-rebuy'),'4500');
      await plus(); assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),3);
      await page.evaluate(()=>{bankroll.amount=18000;renderActiveSessionSurface();});
      await guard.getByRole('button',{name:'ADD BULLET ANYWAY',exact:true}).count();
      await page.evaluate(()=>updateBulletCount(1,true));
      assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),3,'a changed budget needs a fresh review');
      await guard.getByRole('button',{name:'ADD BULLET ANYWAY',exact:true}).click();
      assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),4);
      await page.locator('#play-active-session-wrap .counter-btn').filter({hasText:'−'}).click();
      await page.locator('#play-active-session-wrap .counter-btn').filter({hasText:'−'}).click();
      assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),2); assert.equal(await page.inputValue('#s-rebuy'),'2000','decrement removes the recorded variable cost');
      await page.evaluate(()=>{tourneys.push({id:23,name:'Unpriced future event',date:tourneys[1].date,venue:'Taipei',planning:true});renderActiveSessionSurface();});
      await plus(); assert.equal(await page.evaluate(()=>_activeSessionDraft.bullets),2);
      assert.match(await guard.innerText(),/no buy-in amount/);
      await guard.locator('.guard-review').screenshot({path:out('reentry-review-'+width+'.png'),style:'.mobile-nav,.mobile-subtab-strip{visibility:hidden}'});
      await guard.getByRole('button',{name:'CANCEL',exact:true}).click();
      await page.click('#privacy-toggle');
      await page.waitForFunction(()=>!PokerHQPrivacy.hasMoney(document.querySelector('#play-active-session-wrap .reentry-guard').innerText));
      await page.click('#privacy-toggle');
      await page.waitForFunction(()=>document.querySelector('#play-active-session-wrap .reentry-guard').innerText.includes('₱10,000'));
      for(const light of [false,true]){
        await page.evaluate(light=>document.body.classList.toggle('light',light),light);
        assert.ok(await guard.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      }
      await guard.screenshot({path:out('reentry-guard-'+width+'.png'),style:'.mobile-nav,.mobile-subtab-strip{visibility:hidden}'});
      await page.evaluate(()=>{bankroll.amount=20000;save('bankroll',bankroll);save('tourneys',tourneys);});
      const cloud=await page.evaluate(()=>[...__cloud.docs.entries()]);
      await page.addInitScript(e=>{globalThis.__cloud={docs:new Map(e),listeners:new Map(),stats:{transactions:0,txWrites:0,sets:0,gets:0},failNext:null};},cloud);
      await page.reload(); await page.waitForFunction(()=>typeof __authCallback==='function'); await page.evaluate(u=>__authCallback(u),OWNER);
      await page.waitForTimeout(500);
      await page.evaluate(()=>{var overlay=document.getElementById('onboarding-overlay');if(overlay)overlay.style.display='none';switchGroup('play','sessions');});
      assert.equal(await page.evaluate(()=>_activeSessionDraft.reentryGuard.nextCost),2500);
      assert.equal(await page.evaluate(()=>_activeSessionDraft.reentryGuard.cap),8000);
      assert.deepEqual(await page.evaluate(()=>_activeSessionDraft.reentryGuard.costs),[2000]);
      assert.equal(await page.inputValue('#s-rebuy'),'2000');
      await page.evaluate(()=>switchGroup('plan','calendar'));
      assert.equal(await page.inputValue('#slate-preferred-format'),'Regular');
      await page.evaluate(()=>{loadDemoMode(true);switchGroup('plan','calendar');renderSlatePreferences();});
      assert.equal(await page.inputValue('#slate-preferred-format'),'auto','demo starts with its own preferences');
      if (!await page.locator('#slate-personalize').evaluate(e=>e.open)) await page.locator('#slate-personalize > summary').click();
      await page.selectOption('#slate-preferred-format','Other'); await page.evaluate(()=>{clearDemoMode();renderSlatePreferences();});
      assert.equal(await page.inputValue('#slate-preferred-format'),'Regular','leaving demo restores personal preferences');
      assert.deepEqual(app.realErrors(),[]);
      console.log('PASS personalized picks, explanations, day/time preferences, guard review, costs, privacy and reload at '+width+'px');
    }finally{await app.close();}
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
