'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/data/player-planning.js');
const S = require('../js/data/slate.js');
const logs = (n=3) => Array.from({length:n},(_,i) => ({id:i+1,date:'2026-09-'+String(i+1).padStart(2,'0'),venue:i%2?'PokerStars LIVE Manila at Okada Manila':'Okada Manila',structure:'Turbo',buyin:1000,total:i===2?20000:2000,hours:[5,6,90][i%3]}));
const event = {id:10,name:'Turbo',date:'2026-10-03',venue:'Okada Manila, Parañaque',structure:'Turbo',buyin:3000};

test('history excludes invalid, future, duplicate and satellite-seat records without changing source data', () => {
  const source = logs().concat([logs()[0],{id:7,date:'2099-01-01'},{id:8,date:'bad'},{id:9,date:'2026-09-02',seatViaSatellite:true}]);
  const before = JSON.stringify(source);
  assert.equal(P.profile(source,'2026-10-01').length,3);
  assert.equal(JSON.stringify(source),before);
});
test('personal estimates normalize venue names and use medians with sample counts', () => {
  const a = P.assessment(event,S.dateRange(event.date),P.profile(logs(),'2026-10-01'),{});
  assert.equal(a.cost,6000); assert.equal(a.hours,6); assert.equal(a.costSamples,3); assert.equal(a.hourSamples,3);
  assert.equal(a.scope,'venue + format'); assert.match(a.reasons.join(' '),/Familiar venue/);
});
test('small samples provide no cost or duration prediction and no familiarity bonus', () => {
  const a = P.assessment(event,S.dateRange(event.date),P.profile(logs(2)),{});
  assert.equal(a.cost,0); assert.equal(a.hours,0); assert.equal(a.bonus,0); assert.equal(a.earlyCount,2);
});
test('preferences change tie-breaking while winnings never influence personal rankings', () => {
  const events = [Object.assign({},event,{id:11,structure:'Regular',venue:'Metro Card Club'}),event];
  const options = history => ({budget:3000,assess:(e,r)=>P.assessment(e,r,history,{format:'Turbo'})});
  assert.equal(S.optimize(events,options([])).selected[0].event.id,10);
  const wins = P.profile(logs().map(s=>({...s,prize:1000000,pnl:998000})));
  const losses = P.profile(logs().map(s=>({...s,prize:0,pnl:-2000})));
  assert.deepEqual(wins,losses);
  assert.deepEqual(S.optimize(events,options(wins)).selected,S.optimize(events,options(losses)).selected);
});
test('all days of multi-day events obey availability; existing pins remain in the plan', () => {
  const history=P.profile(logs()), preferences={days:[6]};
  assert.equal(P.assessment(event,S.dateRange(event.date),history,preferences).eligible,true);
  const multi={...event,date:'2026-10-03 to 2026-10-04'};
  assert.equal(P.assessment(multi,S.dateRange(multi.date),history,preferences).eligible,false);
  const pinned=P.assessment({...multi,planning:true},S.dateRange(multi.date),history,preferences);
  assert.equal(pinned.eligible,true); assert.equal(pinned.outsidePreferences,true);
});
test('time allowance filters known durations and leaves unknown schedules for manual review', () => {
  assert.equal(P.assessment(event,S.dateRange(event.date),P.profile(logs()),{maxHours:4}).eligible,false);
  assert.equal(P.assessment(event,S.dateRange(event.date),[],{maxHours:4}).eligible,true);
});
test('turning off session history also removes estimates and familiarity bonuses', () => {
  const a=P.assessment(event,S.dateRange(event.date),P.profile(logs()),{history:false});
  assert.equal(a.bonus,0); assert.equal(a.cost,0); assert.equal(a.hours,0); assert.equal(a.usingHistory,false);
});

const planned = [
  {id:1,name:'Current',date:'2026-10-01',venue:'Okada Manila',buyin:3000,planning:true},
  {id:2,name:'Next',date:'2026-10-03',venue:'Metro Card Club',buyin:4000,planning:true},
  {id:3,date:'2026-10-01',buyin:5000,planning:true},
  {id:4,date:'2026-09-01',buyin:1000,planning:true}
];
const guard = (draft={},events=planned,sessions=[]) => P.reentry(events,sessions,{tourneyId:1,buyin:3000,bullets:1,...draft},{bankroll:20000,today:'2026-10-01'});
test('guard protects all upcoming locations and counts the linked active event once', () => {
  const s=guard({},planned,[{tourneyId:3,date:'2026-10-01'}]);
  assert.equal(s.reserved,4000); assert.equal(s.pinnedCount,1); assert.equal(s.current,3000);
  assert.equal(s.next,3000); assert.equal(s.remaining,10000); assert.equal(s.review,false);
});
test('manual sessions exclude only one exact matching planned event', () => {
  const d={tourneyId:null,name:'Current',date:'2026-10-01',venue:'PokerStars LIVE Manila at Okada Manila'};
  assert.equal(guard(d).reserved,9000);
  assert.equal(guard(d,planned.concat({...planned[0],id:6})).reserved,15000,'ambiguous matches remain protected');
});
test('unknown prices and overspending require review without silently changing any records', () => {
  const events=planned.concat({id:7,date:'2026-10-04',planning:true});
  const before=JSON.stringify(events), s=guard({reentryGuard:{cap:5000,protect:10000}},events);
  assert.equal(s.unknown,1); assert.equal(s.capOver,true); assert.equal(s.remaining,-5000); assert.equal(s.review,true);
  assert.equal(JSON.stringify(events),before);
});
test('recorded variable entry costs survive a changed next-entry price and manual rebuy totals', () => {
  const d={bullets:3,reentryGuard:{costs:[1500,2000],nextCost:2500,cap:9000}};
  assert.equal(guard(d).current,6500); assert.equal(guard(d).next,2500); assert.equal(guard(d).capOver,false);
  assert.equal(guard({...d,rebuy:4000}).current,7000);
  assert.deepEqual(P.entryCosts({buyin:3000,bullets:3}),[3000,3000]);
});
test('guard rejects invalid settings and cannot predict spending without an initial buy-in', () => {
  assert.equal(guard({reentryGuard:{protect:-1}}).invalid,true);
  assert.equal(guard({buyin:0}).missingBuyin,true);
  assert.equal(guard({reentryGuard:{nextCost:0}}).next,0,'an explicitly free additional entry stays free');
});
test('completed future sessions are still protected until played, and new helpers are loaded offline', () => {
  assert.equal(guard({},planned,[{tourneyId:3,date:'2026-10-02'}]).reserved,9000);
  const dir=path.join(__dirname,'..'), html=fs.readFileSync(path.join(dir,'index.html'),'utf8'), sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
  for (const name of ['player-planning.js','reentry-guard.js']) { assert.ok(html.includes(name)); assert.ok(sw.includes(name)); }
});
