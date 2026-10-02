"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Journey = require("../js/data/journey.js");
const Slate = require("../js/data/slate.js");

test("session journey orders checkpoints and finds the largest drop", () => {
  const j = Journey.build({}, [
    {id:2,title:"Double",marker:{elapsedMs:2000,stack:40000}},
    {id:1,title:"Start",marker:{elapsedMs:1000,stack:20000}},
    {id:3,title:"Hit",marker:{elapsedMs:3000,stack:12000}},
    {id:4,marker:{elapsedMs:4000}}
  ]);
  assert.deepEqual(j.points.map((p)=>p.stack),[20000,40000,12000]);
  assert.equal(j.peak,40000); assert.equal(j.low,12000); assert.equal(j.biggestDrop.delta,-28000);
});

test("slate optimizer respects budget, cap, dates and one event per day", () => {
  const r=Slate.optimize([
    {id:1,date:"2026-10-01",name:"Pinned",buyin:5000,planning:true,status:"target",gtd:"1M"},
    {id:2,date:"2026-10-01",name:"Conflict",buyin:1000,status:"target"},
    {id:3,date:"2026-10-02",name:"Second",buyin:4000,status:"stretch"},
    {id:4,date:"2026-10-03",name:"Too big",buyin:12000,status:"target"}
  ],{budget:9000,maxBuyin:6000,from:"2026-10-01",to:"2026-10-03"});
  assert.deepEqual(r.selected.map((x)=>x.event.id),[1,3]);
  assert.equal(r.spent,9000); assert.equal(r.remaining,0); assert.equal(Slate.guarantee("₱2.5M GTD"),2500000);
});

test("roadmap modules are wired offline and sync has shard manifests", () => {
  const root=path.join(__dirname,"..");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  const sync=fs.readFileSync(path.join(root,"js/data/sync.js"),"utf8");
  ["journey.js","slate.js","slate-optimizer.js"].forEach((name)=>{const re=new RegExp(name.replace(".","\\."));assert.match(html,re);assert.match(sw,re);});
  assert.match(sync,/SHARD_THRESHOLD_BYTES/); assert.match(sync,/shardDocKey\(key, "manifest"\)/); assert.match(sync,/chunk_/);
});

test("slate dates: written dates obey ISO bounds and share canonical conflict days", () => {
  const r=Slate.optimize([
    {id:1,date:"April 15, 2026",buyin:1000},
    {id:2,date:"October 1, 2026",buyin:2000,planning:true},
    {id:3,date:"2026-10-01",buyin:1000},
    {id:4,date:"2 October 2026",buyin:1500},
    {id:5,date:"2026-02-30",buyin:100},
    {id:6,date:"October 32, 2026",buyin:100},
    {id:7,date:"2027-01-01",buyin:100},
  ],{budget:5000,from:"2026-09-30",to:"2026-10-31"});
  assert.deepEqual(r.selected.map(c=>c.event.id),[2,4]);
  assert.equal(r.considered,3);
  assert.equal(Slate.normalizeDate("2026-02-30"),"");
});

test("slate reserve stays unspent and multi-day events block overlapping picks", () => {
  const r=Slate.optimize([
    {id:1,date:"October 1–3, 2026",buyin:3000,planning:true},
    {id:2,date:"2026-10-02",buyin:1000},
    {id:3,date:"2026-10-04",buyin:2000},
  ],{budget:6000,reserve:2000,from:"2026-10-01"});
  assert.deepEqual(r.selected.map(c=>c.event.id),[1]);
  assert.equal(r.spent,3000);assert.equal(r.remaining,1000);assert.equal(r.reserve,2000);
  assert.equal(Slate.optimize([{date:"2026-10-01",buyin:1000}],{budget:1000,reserve:2000}).selected.length,0);
});
