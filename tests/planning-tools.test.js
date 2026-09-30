'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../js/data/planning.js'),C=require('../js/data/live-clock.js'),D=require('../js/data/drills.js');
const a={id:1,date:'2026-10-10',name:'Okada Main Event',venue:'Okada Manila',buyin:5000,planning:true};
test('whole plan includes other venues and overlapping multi-day pins; selected pins count once',()=>{
  const events=[a,{id:2,date:'October 8–11, 2026',buyin:2000,planning:true,venue:'Metro'}, {id:3,date:'2026-09-01',buyin:9000,planning:true}];
  const o={budget:12000,from:'2026-10-10',to:'2026-10-30',reserve:1000,travel:500,hotel:1000};
  const r=P.budget(events,[a,{id:4,buyin:2500}],o);assert.equal(r.committed,7000);assert.equal(r.added,2500);assert.equal(r.total,12000);assert.equal(r.remaining,0);assert.equal(r.available,2500);assert.equal(r.over,false);
  assert.equal(P.budget(events,[{id:4,buyin:3000}],o).over,true);
});
test('pins outside window stay out; unknown buy-ins are disclosed',()=>{const r=P.budget([{id:2,date:'2026-10-11',planning:true,buyin:0},a],[],{budget:100,from:'2026-10-11'});assert.equal(r.unknown,1);assert.equal(r.committed,0);});
test('cleanup matches wording and venue variants while preserving distinct flights, prices, times and dates',()=>{
  const b=Object.assign({},a,{id:2,name:'Okada — Main Event',venue:'PokerStars LIVE Manila at Okada Manila',date:'October 10, 2026'});
  assert.equal(P.likelyDuplicate(a,b),true);
  for(const patch of [{date:'2026-10-11'},{buyin:6000},{venue:'Metro Card Club'},{name:'Okada Satellite'}])assert.equal(P.likelyDuplicate(a,Object.assign({},b,patch)),false);
  assert.equal(P.likelyDuplicate({...a,name:'Main Event Flight A'},{...b,name:'Main Event Flight B'}),false);
  assert.equal(P.likelyDuplicate({...a,name:'Main Day 1A'},{...b,name:'Main Day 1B'}),false);
  assert.equal(P.likelyDuplicate({...a,time:'13:00'},{...b,time:'18:00'}),false);
});
test('merge retains chosen id, pin, complementary metadata, both notes and sources',()=>{
  const r=P.merge({...a,planning:false,notes:'First',url:'https://one'}, {id:2,planning:true,time:'12:00',notes:'Second',source:'Official',url:'https://two'});
  assert.equal(r.id,1);assert.equal(r.planning,true);assert.equal(r.time,'12:00');assert.match(r.notes,/First\nSecond/);assert.match(r.notes,/https:\/\/two/);
  assert.match(P.merge({...a,gtd:'1M'},{id:2,gtd:'2M'}).notes,/Other entry — gtd: 2M/);
});
test('level clock counts wall time, pauses without drift, keeps BB and break due across a reload',()=>{
  const c={running:true,startedAt:1000,remaining:60000,played:0,bigBlind:400,chips:20000,nextBreak:60000};
  assert.deepEqual(C.snapshot(c,62000),{remaining:0,played:61000,levelDue:true,breakDue:true,bb:50});
  const paused={...C.settle(c,31000),running:false};assert.equal(C.snapshot(paused,100000).remaining,30000);
  const resumed={...paused,running:true,startedAt:100000};assert.equal(C.snapshot(resumed,110000).remaining,20000);
  assert.equal(C.snapshot({chips:20000,bigBlind:0},0).bb,null);
});
test('custom practice survives daily-drill actions and round trips with unique valid completion days',()=>{
  const s=D.normalizeState({practice:[{id:'hand-1',title:'Thin call',prompt:'Compare two lines',days:['2026-10-01','2026-10-01','bad'],sourceHandId:1}]});
  const changed=D.markDone(s,'2026-10-02','rev-hand','light');assert.deepEqual(changed.practice,s.practice);assert.deepEqual(s.practice[0].days,['2026-10-01']);assert.deepEqual(D.normalizeState(JSON.parse(JSON.stringify(changed))).practice,s.practice);
});
