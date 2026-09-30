'use strict';
(function(root){
  var dates=root ? root.PokerHQSlate : require('./slate.js');
  var places=root ? root.PokerHQStats : require('./stats.js');
  function money(n){n=Number(n);return isFinite(n)&&n>0?n:0;}
  function range(t,parse){var r=dates.dateRange(t.date);if(!r&&parse){var p=parse(t);if(p)r={start:dates.normalizeDate(p.start),end:dates.normalizeDate(p.end)};}return r;}
  function commitments(events,o){return (events||[]).filter(function(t){if(!t||!t.planning)return false;var r=range(t,o.parse);return r&&r.start&&r.end&&(!o.from||r.end>=o.from)&&(!o.to||r.start<=o.to);});}
  function budget(events,picks,o){
    o=o||{};var pinned=commitments(events,o),ids=pinned.map(function(t){return t.id;});
    var committed=pinned.reduce(function(n,t){return n+money(t.buyin);},0);
    var added=(picks||[]).filter(function(t){return ids.indexOf(t.id)<0;}).reduce(function(n,t){return n+money(t.buyin);},0);
    var travel=money(o.travel),hotel=money(o.hotel),reserve=money(o.reserve),total=committed+added+travel+hotel+reserve;
    return {pinned:pinned,committed:committed,added:added,travel:travel,hotel:hotel,reserve:reserve,total:total,remaining:money(o.budget)-total,available:Math.max(0,money(o.budget)-committed-travel-hotel-reserve),over:total>money(o.budget),unknown:pinned.filter(function(t){return !money(t.buyin);}).length};
  }
  function tokens(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().split(/\s+/).filter(Boolean);}
  function likelyDuplicate(a,b,parse){
    var ar=range(a,parse),br=range(b,parse);
    if(!ar||!br||ar.start!==br.start||ar.end!==br.end||!a.venue||!b.venue||places.placeOf(a.venue).key!==places.placeOf(b.venue).key)return false;
    if(money(a.buyin)!==money(b.buyin)||(a.time&&b.time&&a.time!==b.time))return false;
    var at=tokens(a.name),bt=tokens(b.name);if(!at.length||!bt.length)return false;
    function flight(name){return (String(name).toLowerCase().match(/(?:day|flight)\s*\d*\s*[a-z]\b/g)||[]).map(function(t){return t.replace(/\s/g,'');}).join('|');}
    if(flight(a.name)!==flight(b.name))return false;
    // Flight, day, event number and format distinctions must survive cleanup.
    function signature(t){return t.filter(function(w){return /\d/.test(w)||/^(turbo|satellite|qualifier|bounty|pko|freezeout)$/.test(w);}).sort().join('|');}
    if(signature(at)!==signature(bt))return false;
    var common=at.filter(function(w){return bt.indexOf(w)>=0;}).length;
    return common/Math.max(at.length,bt.length)>=0.75;
  }
  function duplicates(events,parse){var pairs=[];(events||[]).forEach(function(a,i){events.slice(i+1).forEach(function(b){if(likelyDuplicate(a,b,parse))pairs.push([a,b]);});});return pairs;}
  function merge(keep,other){
    var result=Object.assign({},keep);Object.keys(other).forEach(function(k){if(k!=='id'&&(result[k]==null||result[k]===''))result[k]=other[k];});
    result.planning=!!(keep.planning||other.planning);
    ['notes','source'].forEach(function(k){result[k]=[keep[k],other[k]].filter(function(v,i,a){return v&&a.indexOf(v)===i;}).join(k==='notes'?'\n':' · ');});
    ['gtd','structure','category','type','region'].forEach(function(k){if(keep[k]&&other[k]&&keep[k]!==other[k])result.notes=(result.notes?result.notes+'\n':'')+'Other entry — '+k+': '+other[k];});
    if(keep.url&&other.url&&keep.url!==other.url)result.notes=(result.notes?result.notes+'\n':'')+'Additional source: '+other.url;
    return result;
  }
  var api={budget:budget,commitments:commitments,duplicates:duplicates,likelyDuplicate:likelyDuplicate,merge:merge};
  if(typeof module!=='undefined')module.exports=api;if(root)root.PokerHQPlanning=api;
})(typeof window!=='undefined'?window:null);
