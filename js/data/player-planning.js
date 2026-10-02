'use strict';
(function(root) {
  var dates = root ? root.PokerHQSlate : require('./slate.js');
  var places = root ? root.PokerHQStats : require('./stats.js');
  var util = root || require('./util.js');
  var planning = root ? root.PokerHQPlanning : require('./planning.js');
  function money(n) { n = Number(n); return isFinite(n) && n > 0 ? n : 0; }
  function median(values) { var a = values.slice().sort(function(x,y) { return x-y; }), m = Math.floor(a.length/2); return a.length ? (a.length%2 ? a[m] : (a[m-1]+a[m])/2) : 0; }
  function profile(sessions, today) {
    var seen = new Set();
    return (sessions || []).filter(function(s) {
      if (!s || seen.has(s.id) || s.seatViaSatellite) return false;
      if (s.id != null) seen.add(s.id);
      var day = dates.normalizeDate(s.date);
      return !!day && (!today || day <= today);
    }).sort(function(a,b) { return dates.normalizeDate(b.date).localeCompare(dates.normalizeDate(a.date)); }).slice(0,80).map(function(s) {
      var buyin = money(s.buyin), total = money(s.total) || buyin + money(s.rebuy);
      return { venue: places.placeOf(s.venue).key, format: util.normalizeFormat(s.structure), hours: money(s.hours), ratio: buyin && total >= buyin ? total/buyin : 0 };
    });
  }
  function assessment(event, range, history, preferences) {
    var p = preferences || {}, venue = places.placeOf(event.venue).key, format = util.normalizeFormat(event.structure);
    history = Array.isArray(history) && p.history !== false ? history : [];
    var venueLogs = history.filter(function(s) { return event.venue && s.venue === venue; });
    var formatLogs = history.filter(function(s) { return format && format !== 'Other' && s.format === format; });
    var both = venueLogs.filter(function(s) { return format && s.format === format; });
    var sample = both.length >= 3 ? both : venueLogs.length >= 3 ? venueLogs : formatLogs.length >= 3 ? formatLogs : [];
    var scope = both.length >= 3 ? 'venue + format' : venueLogs.length >= 3 ? 'venue' : formatLogs.length >= 3 ? 'format' : '';
    var costs = sample.filter(function(s) { return s.ratio > 0; }), durations = sample.filter(function(s) { return s.hours > 0; });
    var typicalCost = costs.length >= 3 ? Math.round(money(event.buyin) * median(costs.map(function(s) { return s.ratio; }))) : 0;
    var hours = durations.length >= 3 ? Math.round(median(durations.map(function(s) { return s.hours; })) * 10)/10 : 0;
    var reasons = [], bonus = 0, eligible = true;
    if (venueLogs.length >= 3) { bonus += Math.min(10,venueLogs.length); reasons.push('Familiar venue · '+venueLogs.length+' logged sessions'); }
    var preferred = p.format && p.format !== 'auto' ? p.format : '';
    if (preferred && format === preferred) { bonus += 12; reasons.push('Matches your preferred '+preferred+' format'); }
    else if (!preferred && formatLogs.length >= 3) { bonus += Math.min(10,formatLogs.length); reasons.push('Familiar '+format+' format · '+formatLogs.length+' sessions'); }
    if (Array.isArray(p.days) && p.days.length < 7) {
      var start = new Date(range.start+'T12:00:00'), end = new Date(range.end+'T12:00:00');
      for (var i=0; i<7 && start<=end; i++,start.setDate(start.getDate()+1)) {
        if (p.days.indexOf(start.getDay()) < 0) { eligible = false; break; }
      }
      if (eligible) reasons.push('Fits your available days');
    }
    if (money(p.maxHours) && hours > money(p.maxHours)) eligible = false;
    if (typicalCost) bonus -= Math.min(15,Math.max(0,typicalCost/money(event.buyin)-1)*5);
    return { eligible: event.planning || eligible, bonus: bonus, reasons: reasons, cost: typicalCost, costSamples: costs.length,
      hours: hours, hourSamples: durations.length, scope: scope, sampleCount: sample.length,
      earlyCount: Math.max(both.length,venueLogs.length,formatLogs.length), usingHistory: p.history !== false, outsidePreferences: !eligible && !!event.planning };
  }
  function entryCosts(draft) {
    var d = draft || {}, g = d.reentryGuard || {}, count = Math.max(1,Math.floor(money(d.bullets) || 1)), base = money(d.buyin), costs = [];
    for (var i=0; i<count-1; i++) costs.push(Array.isArray(g.costs) && isFinite(Number(g.costs[i])) && Number(g.costs[i]) >= 0 ? Number(g.costs[i]) : base);
    return costs;
  }
  function reentry(events, sessions, draft, options) {
    var o = options || {}, d = draft || {}, g = d.reentryGuard || {}, today = o.today || util.todayLocal();
    var completed = new Set((sessions || []).filter(function(s) { return s && s.tourneyId != null && dates.normalizeDate(s.date) && dates.normalizeDate(s.date)<=today; }).map(function(s) { return s.tourneyId; }));
    var pinned = planning.commitments(events,{ from: today, parse: o.parse }).filter(function(t) { return !completed.has(t.id); });
    var activeId = d.tourneyId;
    if (activeId == null) {
      var matches = pinned.filter(function(t) { return dates.normalizeDate(t.date) === dates.normalizeDate(d.date) && String(t.name||'').trim().toLowerCase() === String(d.name||'').trim().toLowerCase() && d.venue && places.placeOf(t.venue).key === places.placeOf(d.venue).key; });
      if (matches.length === 1) activeId = matches[0].id;
    }
    pinned = pinned.filter(function(t) { return t.id !== activeId; });
    var reserved = pinned.reduce(function(n,t) { return n+money(t.buyin); },0), unknown = pinned.filter(function(t) { return !money(t.buyin); }).length;
    var costs = entryCosts(d), extra = d.rebuy != null && isFinite(Number(d.rebuy)) && Number(d.rebuy)>=0 ? Number(d.rebuy) : costs.reduce(function(n,c) { return n+c; },0), current = money(d.buyin)+extra;
    var next = g.nextCost == null ? money(d.buyin) : money(g.nextCost), protect = money(g.protect), cap = money(g.cap);
    var remaining = money(o.bankroll)-reserved-protect-current-next;
    var invalid = ['cap','protect','nextCost'].some(function(k) { return g[k] != null && (!isFinite(Number(g[k])) || Number(g[k]) < 0); });
    return { current: current, next: next, costs: costs, reserved: reserved, pinnedCount: pinned.length, unknown: unknown,
      protect: protect, remaining: remaining, cap: cap, capOver: !!cap && current+next>cap,
      invalid: invalid, missingBuyin: !money(d.buyin), review: remaining<0 || (!!cap && current+next>cap) || unknown>0 };
  }
  var api = { profile: profile, assessment: assessment, reentry: reentry, entryCosts: entryCosts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PokerHQPlayerPlanning = api;
})(typeof window !== 'undefined' ? window : null);
