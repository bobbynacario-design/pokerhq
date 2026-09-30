"use strict";
const assert = require('node:assert/strict');
const { boot, out } = require('./lib.js');

(async () => {
  const guest=await boot({signedIn:false,viewport:{width:390,height:844}});
  try {
    const {page}=guest;
    await page.evaluate(() => {
      __authCallback(null);
      window.sessions=[{id:42,name:'Private cached session',date:todayLocal(),prize:0,pnl:-1000,total:1000,result:'bust'}];
      syncGlobalAliases();
      localStorage.setItem(resolveScopedLocalKey('sessions'),JSON.stringify(sessions));
      _activeSessionDraft={key:'real-draft',name:'Private active session',date:todayLocal(),bullets:2};
      saveScopedUiJson(ACTIVE_SESSION_DRAFT_STORAGE_KEY,_activeSessionDraft);
      localStorage.setItem('pokerhq_drill_v1',JSON.stringify({saved:['old-drill']}));
    });
    const storage=()=>page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])));
    const before=await storage();
    await page.click('#login-demo-btn');
    await page.waitForFunction(()=>_demoMode&&document.getElementById('login-overlay').classList.contains('hidden'));
    assert.doesNotMatch(await page.locator('#page-dashboard').innerText(),/Private cached|Private active/);
    assert.equal(await page.evaluate(()=>__cloud.stats.transactions+__cloud.stats.gets+__cloud.stats.sets),0);
    await page.evaluate(()=>__authCallback(null));
    assert.equal(await page.locator('#login-overlay').isVisible(),false,'late auth resolution keeps the demo open');
    const dates=await page.evaluate(()=>({today:todayLocal(),latest:sessions[0].date,first:tourneys[0].date,firstRange:parseTourneyDateRange(tourneys[0]).start.getTime()}));
    assert.ok(dates.latest<dates.today);assert.ok(dates.first>dates.today);
    assert.equal(await page.locator('#home-settings').getAttribute('open'),null);
    assert.equal(await page.locator('#home-analytics').getAttribute('open'),null);
    await page.getByRole('button',{name:'I DID IT',exact:true}).click();
    await page.evaluate(()=> { ensureActiveSessionDraft({name:'Demo run'}); save('sessions',sessions); });
    assert.equal(await storage(),before,'demo drills and active-session actions leave cached real data untouched');
    await page.click('#demo-clear-btn');
    await page.waitForSelector('#login-google-btn',{state:'visible'});
    assert.equal(await storage(),before);
    assert.equal(await page.evaluate(()=>sessions[0].name),'Private cached session');
    assert.equal(await page.evaluate(()=>_activeSessionDraft.key),'real-draft');
    assert.deepEqual(guest.realErrors(),[]);
    console.log('ok guest demo is current, private, and leaves cached data and active drafts intact');
  } finally {await guest.close();}

  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const app=await boot({viewport});
    try {
      const {page}=app;
      await page.evaluate(()=>{
        window.bankroll.amount=100000;
        window.tourneys=[
          {id:1,date:'April 15, 2026',name:'Past event',buyin:1000},
          {id:2,date:'October 1, 2026',name:'Written Main',buyin:5000,gtd:'1M'},
          {id:3,date:'2026-10-01',name:'Same-day option',buyin:1000},
          {id:4,date:'2026-10-02',name:'Friday Side',buyin:2000}
        ];syncGlobalAliases();switchGroup('plan','calendar');
      });
      assert.equal(await page.locator('#push-start').isVisible(),false,'notification settings start collapsed');
      await page.locator('#push-settings-card > summary').click();
      assert.equal(await page.locator('#push-start').isVisible(),true);
      await page.locator('#push-settings-card > summary').click();
      await page.fill('#slate-budget','9000');await page.fill('#slate-reserve','2000');await page.fill('#slate-from','2026-09-30');
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      assert.doesNotMatch(await page.locator('#slate-results').innerText(),/Past event/);
      assert.equal(await page.getByLabel('Select Written Main',{exact:true}).isChecked(),true);
      assert.equal(await page.getByLabel('Select Friday Side',{exact:true}).isChecked(),true);
      assert.match(await page.locator('#slate-summary').innerText(),/2,000 reserved/);
      await page.getByLabel('Select Same-day option',{exact:true}).check();
      assert.equal(await page.locator('#slate-apply').isEnabled(),false);
      await page.getByLabel('Select Same-day option',{exact:true}).uncheck();
      await page.click('#slate-apply');
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id)),[2,4]);
      await page.evaluate(()=>undoLastDelete());
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id)),[]);
      await page.click('#slate-apply');
      await page.reload();await page.waitForFunction(()=>typeof __authCallback==='function');
      await page.evaluate(()=>{__authCallback({uid:'u1',email:'bobbynacario@gmail.com',isAnonymous:false});});
      await page.waitForTimeout(400);
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id)),[2,4],'applied stars survive reload');
      await page.evaluate(()=>{var o=document.getElementById('onboarding-overlay');if(o)o.style.display='none';switchGroup('play','sessions');});
      await page.fill('#s-name','Eighth place');await page.fill('#s-buyin','1000');await page.fill('#s-prize','3000');await page.fill('#s-position','8');await page.selectOption('#s-final-table','yes');
      await page.click('#session-submit-btn');
      await page.waitForFunction(()=>sessions.some(s=>s.name==='Eighth place'));
      await page.waitForSelector('#modal-session-detail.open');
      const saved=await page.evaluate(()=>sessions.find(s=>s.name==='Eighth place'));
      assert.equal(saved.finalTable,true);assert.equal(saved.result,'final');
      await page.evaluate((id)=>{closeModal('modal-session-detail');editSession(id);},saved.id);
      assert.equal(await page.inputValue('#s-final-table'),'yes');
      await page.selectOption('#s-final-table','no');await page.click('#session-submit-btn');
      await page.waitForFunction(()=>sessions[0].finalTable===false);
      await page.waitForSelector('#modal-session-detail.open');
      assert.equal(await page.evaluate(()=>sessions[0].result),'itm');
      const backup=await page.evaluate(()=>PokerHQBackup.parse(getBackupSnapshot()).data.sessions[0]);
      assert.equal(backup.finalTable,false,'final-table status round-trips through the backup format');
      await page.evaluate(()=>{closeModal('modal-session-detail');switchGroup('play','sessions');startSessionFromHome();});
      await page.waitForSelector('#modal-readiness.open');
      assert.match(await page.locator('#readiness-title').innerText(),/Complete check-in/);
      assert.equal(await page.locator('#readiness-start-btn').isEnabled(),false);
      await page.evaluate(()=>['sleep','energy','food','bankrollFit','strategyReviewed','villainNotes'].forEach((key,i)=>setReadinessField(key,['good','high','fed','target','yes','yes'][i])));
      assert.match(await page.locator('#readiness-title').innerText(),/^Ready$/);
      assert.equal(await page.locator('#readiness-start-btn').isEnabled(),true);
      await page.click('#readiness-start-btn');
      assert.equal(await page.evaluate(()=>_activeSessionDraft.readiness.status),'ready');
      await page.evaluate(()=>{endActiveSession();switchGroup('plan','calendar');});
      await page.fill('#slate-budget','9000');await page.fill('#slate-reserve','2000');await page.fill('#slate-from','2026-09-30');
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page fits viewport');
      await page.screenshot({path:out('enhancements-'+viewport.width+'.png'),fullPage:true});
      assert.deepEqual(app.realErrors(),[]);
      console.log('ok '+viewport.width+'px: slate dates, reserve, selections, pin/undo/reload, final-table edit/backup, readiness and collapsible settings');
    } finally {await app.close();}
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
