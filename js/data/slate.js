"use strict";
(function(root) {
  function money(v) { v = Number(v); return isFinite(v) && v > 0 ? v : 0; }
  function guarantee(v) { var s=String(v||"").toLowerCase().replace(/[,₱\s]/g,""); var m=s.match(/([\d.]+)([mk])?/); return m ? Number(m[1])*(m[2]==="m"?1000000:m[2]==="k"?1000:1) : 0; }
  var months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  function normalizeDate(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.getFullYear()+'-'+String(value.getMonth()+1).padStart(2,'0')+'-'+String(value.getDate()).padStart(2,'0');
    var text=String(value||'').trim(), m=text.match(/^(\d{4})-(\d{2})-(\d{2})$/), year,month,day;
    if (m) { year=+m[1];month=+m[2]-1;day=+m[3]; }
    else {
      m=text.match(/^([a-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
      if (!m) { var first=text.match(/^(\d{1,2})\s+([a-z]+)\.?,?\s+(\d{4})$/i); if(first)m=[first[0],first[2],first[1],first[3]]; }
      if(!m)return '';
      month=months.findIndex(function(name){return name===m[1].toLowerCase()||name.slice(0,3)===m[1].toLowerCase();});day=+m[2];year=+m[3];
    }
    if(month<0||month>11||day<1||year<1000)return '';
    var date=new Date(year,month,day);
    return date.getMonth()===month&&date.getDate()===day ? normalizeDate(date) : '';
  }
  function dateRange(text) {
    var single=normalizeDate(text);if(single)return {start:single,end:single};
    var m=String(text||'').match(/^(\d{4}-\d{2}-\d{2})\s*(?:to|[–-])\s*(\d{4}-\d{2}-\d{2})$/i);
    if(m)return {start:normalizeDate(m[1]),end:normalizeDate(m[2])};
    m=String(text||'').match(/^([a-z]+)\s+(\d{1,2})\s*[–-]\s*(?:([a-z]+)\s+)?(\d{1,2}),?\s+(\d{4})$/i);
    return m ? {start:normalizeDate(m[1]+' '+m[2]+', '+m[5]),end:normalizeDate((m[3]||m[1])+' '+m[4]+', '+m[5])} : null;
  }
  function optimize(events, options) {
    var o=options||{}, budget=money(o.budget), reserve=money(o.reserve), available=Math.max(0,budget-reserve),maxBuyin=money(o.maxBuyin)||budget;
    var candidates=(Array.isArray(events)?events:[]).map(function(e){
      if(!e)return null;
      var b=money(e.buyin),r=dateRange(e.date);
      // Calendar handles year-less legacy dates; explicit invalid dates must stay rejected.
      if(!r&&!/\d{4}/.test(String(e.date||''))&&typeof o.dateRange==='function') {var parsed=o.dateRange(e);if(parsed)r={start:normalizeDate(parsed.start),end:normalizeDate(parsed.end)};}
      if(!b||b>maxBuyin||!r||!r.start||!r.end||r.end<r.start||(o.from&&r.start<o.from)||(o.to&&r.end>o.to))return null;
      var personal = typeof o.assess === 'function' ? o.assess(e,r) : null;
      if (personal && personal.eligible === false) return null;
      var g=guarantee(e.gtd),score=(e.planning?35:0)+(e.status==='target'?25:e.status==='stretch'?10:0)+Math.min(30,g?Math.log10(g/b+1)*12:0);
      score += personal ? Number(personal.bonus)||0 : 0;
      return {event:e,buyin:b,date:r.start,endDate:r.end,score:Math.round(score*10)/10,personal:personal};
    }).filter(Boolean).sort(function(a,b){return b.score-a.score||a.buyin-b.buyin||a.date.localeCompare(b.date);});
    var selected=[],spent=0;
    candidates.forEach(function(c){if(spent+c.buyin>available||selected.some(function(x){return c.date<=x.endDate&&c.endDate>=x.date;}))return;selected.push(c);spent+=c.buyin;});
    selected.sort(function(a,b){return a.date.localeCompare(b.date);});
    return {selected:selected,candidates:candidates,spent:spent,remaining:Math.max(0,available-spent),reserve:reserve,available:available,considered:candidates.length};
  }
  var api={guarantee:guarantee,normalizeDate:normalizeDate,dateRange:dateRange,optimize:optimize};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;if(root)root.PokerHQSlate=api;
})(typeof window!=="undefined"?window:undefined);
