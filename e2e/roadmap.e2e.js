"use strict";
const assert = require("node:assert/strict");
const { boot } = require("./lib.js");

(async () => {
  const { page, realErrors, close } = await boot({ viewport: {width: 1100, height: 900} });
  const ok = (m) => console.log("ok  " + m);

  await page.evaluate(() => {
    window.tourneys = [
      {id:1,date:"2026-10-10",name:"Pinned Main",venue:"Okada",buyin:5000,gtd:"1M",planning:true},
      {id:2,date:"2026-10-10",name:"Conflict",venue:"Metro",buyin:1000,gtd:"50K"},
      {id:3,date:"2026-10-11",name:"Sunday Side",venue:"Solaire",buyin:4000,gtd:"500K"}
    ];
    syncGlobalAliases(); switchGroup("plan", "calendar");
  });
  await page.fill("#slate-budget", "9000");
  await page.fill("#slate-max-buyin", "6000");
  await page.fill("#slate-from", "2026-10-01");
  await page.click("#slate-optimizer-card button:has-text('BUILD SLATE')");
  const slate = await page.textContent("#slate-results");
  assert.match(slate, /Pinned Main/); assert.match(slate, /Sunday Side/); assert.match(slate, /9,000/);
  assert.equal(await page.getByLabel('Select Conflict',{exact:true}).isChecked(),false);
  ok("Slate Optimizer selects a budget-safe, conflict-free two-day schedule");

  await page.evaluate(() => {
    const sid = 8801, now = Date.now();
    window.sessions = [{id:sid,date:"2026-09-30",name:"Journey Main",venue:"Okada",total:5000,pnl:-5000,result:"bust"}];
    window.hands = [
      {id:now-3,sessionId:sid,title:"Start",tags:["tilt"],marker:{at:now-3,elapsedMs:1000,stack:"20bb"}},
      {id:now-2,sessionId:sid,title:"Double",tags:["tilt"],marker:{at:now-2,elapsedMs:2000,stack:"40bb"}},
      {id:now-1,sessionId:sid,title:"Drop",tags:["tilt"],marker:{at:now-1,elapsedMs:3000,stack:"12bb"}}
    ];
    syncGlobalAliases(); viewSessionDetail(sid);
  });
  const journey = await page.textContent("#sd-body");
  assert.match(journey, /Session Journey/); assert.match(journey, /peak 40 BB/); assert.match(journey, /biggest marked drop 28/);
  ok("Session detail renders the marker-driven stack journey and largest drop");
  await page.evaluate(() => { closeModal("modal-session-detail"); refreshInboxNow(); switchGroup("review", "inbox"); });
  await page.waitForTimeout(100);
  const inbox = await page.textContent("#inbox-list");
  assert.match(inbox, /Recurring leaks/); assert.match(inbox, /tilt keeps recurring/);
  ok("three recent matching tags surface a recurring leak in the Inbox");

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(() => switchGroup("plan", "calendar"));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "new roadmap UI fits a phone");
  assert.deepEqual(realErrors(), []);
  ok("roadmap surfaces fit on phone and produce no page errors");
  await close();
})().catch((e) => { console.error("FAIL:", e.stack || e); process.exit(1); });
