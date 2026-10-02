'use strict';
const assert=require('node:assert/strict');const {boot,out}=require('./lib.js');
(async()=>{
  for(const width of [1280,390]){
    const app=await boot({viewport:{width,height:900}}),{page}=app;
    try{
      await page.evaluate(async()=>{
        var base={name:'Okada Main Event',date:'2026-10-03',venue:'Okada Manila',buyin:3000};
        window.tourneys=Array.from({length:31},(_,i)=>Object.assign({},base,{id:i+1,planning:i===1,notes:'Source '+(i+1)})).concat([
          Object.assign({},base,{id:90,name:'Different event',notes:'Keep me'}),
          Object.assign({},base,{id:91,date:'2026-10-04'}),
          Object.assign({},base,{id:92,buyin:5000}),
          Object.assign({},base,{id:93,venue:'Metro Card Club'}),
          Object.assign({},base,{id:94,name:'Main Event Flight A'}),
          Object.assign({},base,{id:95,name:'Main Event Flight B'})
        ]);
        window.sessions=[1,2].map(id=>({id:100+id,tourneyId:id,name:'Played sample',date:'2026-09-01',buyin:3000,total:3000,prize:0,pnl:-3000,hours:2,venue:'Okada Manila',notes:''}));
        syncGlobalAliases();await Promise.all(['tourneys','sessions'].map(k=>fbSave(k,window[k])));
        replaceActiveSessionDraft({name:'Okada Main Event',date:todayLocal(),buyin:3000,tourneyId:3});
        switchGroup('plan','calendar');renderCalendar();
      });
      await page.getByRole('button',{name:'REVIEW DUPLICATES',exact:true}).click();
      assert.match(await page.locator('#cleanup-body').innerText(),/30 extra entries in 1 duplicate group/);
      assert.equal(await page.locator('.cleanup-pairs').evaluate(e=>e.open),false);
      assert.equal(await page.getByRole('button',{name:'PREVIEW MERGE',exact:true}).first().isVisible(),false);
      await page.getByRole('button',{name:'REMOVE ALL DUPLICATES',exact:true}).click();
      assert.equal(await page.evaluate(()=>tourneys.length),37,'preview does not remove anything');
      await page.getByRole('button',{name:'BACK',exact:true}).click();
      assert.equal(await page.evaluate(()=>tourneys.length),37);
      await page.getByRole('button',{name:'REMOVE ALL DUPLICATES',exact:true}).click();
      await page.locator('.cleanup-pairs > summary').click();
      assert.match(await page.locator('#cleanup-body').innerText(),/31 copies → 1 event · ★ Pinned/);
      await page.locator('#modal-calendar-cleanup .modal').screenshot({path:out('batch-duplicates-'+width+'.png')});
      assert.ok(await page.locator('#modal-calendar-cleanup .modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
      await page.evaluate(()=>{tourneys[0].notes='Changed before confirmation';tourneys.push({id:96,name:'Added meanwhile',date:'2026-10-06',venue:'Metro Card Club',buyin:2000});});
      await page.getByRole('button',{name:'REMOVE 30 DUPLICATES',exact:true}).click();
      assert.equal(await page.evaluate(()=>tourneys.length),38,'changed data requires a refreshed confirmation');
      assert.match(await page.locator('#cleanup-body').innerText(),/calendar changed/);
      const originals=await page.evaluate(()=>JSON.parse(JSON.stringify(tourneys)));
      await page.getByRole('button',{name:'REMOVE 30 DUPLICATES',exact:true}).click();
      assert.equal(await page.evaluate(()=>tourneys.length),8);
      assert.equal(await page.locator('#modal-calendar-cleanup').isVisible(),false,'finished cleanup reveals Undo immediately');
      const kept=await page.evaluate(()=>tourneys.find(t=>t.id===3));
      assert.equal(kept.planning,true);assert.match(kept.notes,/Changed before confirmation/);assert.match(kept.notes,/Source 31/);
      assert.deepEqual(await page.evaluate(()=>sessions.map(s=>s.tourneyId)),[3,3]);
      assert.equal(await page.evaluate(()=>_activeSessionDraft.tourneyId),3);
      assert.equal(await page.evaluate(()=>PokerHQPlanning.cleanup(tourneys,parseTourneyDateRange).removed),0);
      await page.evaluate(()=>{tourneys.find(t=>t.id===90).notes='Unrelated edit after cleanup';sessions[0].notes='Session edit after cleanup';});
      await page.locator('#undo-toast .toast-btn').click();
      assert.equal(await page.evaluate(()=>tourneys.length),38);
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.id<90)),originals.filter(t=>t.id<90));
      assert.equal(await page.evaluate(()=>tourneys.find(t=>t.id===90).notes),'Unrelated edit after cleanup');
      assert.deepEqual(await page.evaluate(()=>sessions.map(s=>s.tourneyId)),[1,2]);
      assert.equal(await page.evaluate(()=>sessions[0].notes),'Session edit after cleanup');
      await page.locator('#modal-calendar-cleanup').getByRole('button',{name:'CLOSE',exact:true}).click();
      await page.getByRole('button',{name:'REMOVE DUPLICATES',exact:true}).click();
      assert.match(await page.locator('#cleanup-body').innerText(),/Remove 30 duplicate entries/);
      await page.getByRole('button',{name:'REMOVE 30 DUPLICATES',exact:true}).click();
      await page.evaluate(()=>{tourneys.find(t=>t.id===3).notes='Kept entry edited';undoLastDelete();});
      assert.equal(await page.evaluate(()=>tourneys.length),8);
      assert.equal(await page.evaluate(()=>tourneys.find(t=>t.id===3).notes),'Kept entry edited');
      assert.match(app.dialogs.at(-1).message,/event changed/);
      assert.deepEqual(app.realErrors(),[]);
      console.log('PASS '+width+'px batch preview, 31-copy cleanup, distinct flights, metadata, session links, refreshed confirmation and guarded Undo');
    }finally{await app.close();}
  }
  const demo=await boot({demo:true,viewport:{width:390,height:900}});
  try{
    const {page}=demo;
    await page.evaluate(()=>{
      closeDemoTour();window.tourneys=[{id:1,name:'Demo Main',date:todayLocal(),venue:'Okada Manila',buyin:3000},{id:2,name:'Demo Main',date:todayLocal(),venue:'Okada Manila',buyin:3000,planning:true}];syncGlobalAliases();switchGroup('plan','calendar');dedupeTourneys();
    });
    const writes=await page.evaluate(()=>__cloud.stats.sets+__cloud.stats.transactions);
    await page.getByRole('button',{name:'REMOVE 1 DUPLICATE',exact:true}).click();
    assert.equal(await page.evaluate(()=>tourneys.length),1);
    await page.locator('#undo-toast .toast-btn').click();assert.equal(await page.evaluate(()=>tourneys.length),2);
    await page.evaluate(()=>previewCalendarBatch());await page.getByRole('button',{name:'REMOVE 1 DUPLICATE',exact:true}).click();
    await page.evaluate(()=>{tourneys[0].notes='Demo edit';undoLastDelete();});
    assert.equal(await page.evaluate(()=>tourneys.length),1);assert.equal(await page.evaluate(()=>tourneys[0].notes),'Demo edit');
    assert.equal(await page.evaluate(()=>__cloud.stats.sets+__cloud.stats.transactions),writes,'demo cleanup and undo never write to cloud');
    assert.deepEqual(demo.realErrors(),[]);console.log('PASS demo batch cleanup/undo stays in memory and preserves later edits');
  }finally{await demo.close();}
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
