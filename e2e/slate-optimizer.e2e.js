"use strict";
const assert = require('node:assert/strict');
const {boot,out} = require('./lib.js');

(async()=>{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    const app=await boot({viewport});
    try{
      const {page}=app;
      await page.evaluate(()=>{
        bankroll.amount=123456;
        window.tourneys=Array.from({length:24},(_,i)=>({id:i+1,name:'Okada choice '+String(i+1).padStart(2,'0'),venue:i%2?'PokerStars LIVE Manila at Okada Manila':'Okada Manila, Parañaque',date:'2026-10-'+String(i+1).padStart(2,'0'),buyin:1000,time:'18:00'})).concat([
          {id:101,name:'Metro late main',venue:'Metro Card Club, Pasig',date:'2026-10-25',buyin:1500},
          {id:102,name:'Metro late side',venue:'Metrocard Club',date:'2026-10-26',buyin:1000},
          {id:103,name:'Taipei weekend',venue:'Taipei',date:'2026-10-27',buyin:1000}
        ]);
        syncGlobalAliases();switchGroup('plan','calendar');
      });
      assert.equal(await page.inputValue('#slate-location'),'','multiple locations require an intentional choice');
      await page.getByRole('button',{name:'USE CURRENT BANKROLL',exact:true}).click();
      assert.equal(await page.inputValue('#slate-budget'),'123456');
      assert.equal(await page.locator('#slate-event-list').count(),0,'bankroll button never generates a long list');
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      assert.match(await page.locator('#slate-results').innerText(),/Choose a location first/);
      await page.selectOption('#slate-location','okada');
      await page.fill('#slate-budget','9000');
      await page.locator('#slate-limits > summary').click();
      await page.fill('#slate-reserve','1000');
      await page.fill('#slate-from','2026-10-01');await page.fill('#slate-to','2026-10-29');
      await page.locator('#slate-limits > summary').click();
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      assert.equal(await page.locator('#slate-event-list input').count(),6);
      assert.match(await page.locator('#slate-browse-tab').innerText(),/24/,'venue spellings consolidate into one location');
      assert.doesNotMatch(await page.locator('#slate-results').innerText(),/Metro late|Taipei weekend/);
      assert.match(await page.locator('#slate-summary').innerText(),/8 selected · ₱8,000/);
      assert.match(await page.locator('#slate-pagination').innerText(),/1–6 of 8/);
      const first=page.getByLabel('Select Okada choice 01',{exact:true});
      await first.uncheck();
      assert.equal(await first.isVisible(),true,'unchecked shortlist row stays in place');
      assert.match(await page.locator('#slate-summary').innerText(),/7 selected/);
      await first.focus();await page.keyboard.press('Space');
      assert.equal(await first.isChecked(),true,'checkbox remains keyboard operable');
      await page.locator('#slate-pagination').getByRole('button',{name:'NEXT',exact:true}).click();
      await page.getByLabel('Select Okada choice 08',{exact:true}).uncheck();
      await page.locator('#slate-pagination').getByRole('button',{name:'PREVIOUS',exact:true}).click();
      assert.equal(await first.isChecked(),true);
      await page.click('#slate-browse-tab');
      assert.equal(await page.locator('#slate-event-list input').count(),6);
      await page.fill('#slate-search','choice 18');
      const extra=page.getByLabel('Select Okada choice 18',{exact:true});
      await extra.check();
      assert.equal(await page.locator('#slate-apply').isEnabled(),true);
      await page.fill('#slate-search','nothing-matches');
      assert.match(await page.locator('#slate-event-list').innerText(),/No events match/);
      await page.click('#slate-shortlist-tab');
      await page.locator('#slate-pagination').getByRole('button',{name:'NEXT',exact:true}).click();
      assert.equal(await extra.isChecked(),true,'alternative survives search and view switches');
      assert.equal(await page.getByLabel('Select Okada choice 08',{exact:true}).isChecked(),false);
      await page.getByRole('button',{name:'CLEAR SELECTION',exact:true}).click();
      assert.match(await page.locator('#slate-summary').innerText(),/0 selected/);
      assert.equal(await page.locator('#slate-apply').isEnabled(),false);
      assert.equal(await page.locator('#slate-event-list input:checked').count(),0);
      await page.getByRole('button',{name:'RESET SUGGESTIONS',exact:true}).click();
      assert.match(await page.locator('#slate-summary').innerText(),/8 selected/);
      assert.match(await page.locator('#slate-pagination').innerText(),/1–6 of 8/);
      await first.uncheck();await page.click('#slate-apply');
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id)),[2,3,4,5,6,7,8]);
      await page.evaluate(()=>undoLastDelete());
      assert.deepEqual(await page.evaluate(()=>tourneys.filter(t=>t.planning).map(t=>t.id)),[]);
      await page.getByRole('button',{name:'RESET SUGGESTIONS',exact:true}).click();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'shortlist fits the viewport');
      await page.screenshot({path:out('slate-shortlist-'+viewport.width+'.png'),fullPage:true});
      await page.locator('#slate-optimizer-card').screenshot({path:out('slate-optimizer-'+viewport.width+'.png')});
      await page.selectOption('#slate-location','*');
      assert.equal(await page.locator('#slate-event-list').count(),0,'changing location invalidates the old choices');
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      await page.click('#slate-browse-tab');
      assert.deepEqual(await page.locator('.slate-location-heading').allTextContents(),['Metro Card Club','Okada Manila']);
      assert.equal(await page.locator('#slate-event-list input').count(),6,'all locations are grouped and paginated');
      await page.selectOption('#slate-location','metrocardclub');
      await page.getByRole('button',{name:'BUILD SLATE',exact:true}).click();
      assert.match(await page.locator('#slate-results').innerText(),/Metro late main/);
      assert.doesNotMatch(await page.locator('#slate-results').innerText(),/Okada choice|Taipei weekend/);
      await page.getByRole('button',{name:'NEXT 7 DAYS',exact:true}).click();
      const windowDays=await page.evaluate(()=>({from:document.getElementById('slate-from').value,to:document.getElementById('slate-to').value,today:todayLocal()}));
      assert.equal(windowDays.from,windowDays.today);
      assert.equal((Date.parse(windowDays.to)-Date.parse(windowDays.from))/86400000,6);
      assert.equal(await page.locator('#slate-event-list').count(),0);
      assert.deepEqual(app.realErrors(),[]);
      console.log('ok '+viewport.width+'px: budget-only fill, location gating, compact shortlist, paging, search, clear/reset, keyboard, selection preservation, pin/undo and date shortcuts');
    }finally{await app.close();}
  }
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
