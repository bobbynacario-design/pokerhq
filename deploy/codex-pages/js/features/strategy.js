function addStrategy() {
  var raw = document.getElementById('strategy-raw').value.trim();
  if (!raw) return;
  var s = {
    id: Date.now(),
    week: new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }),
    topic: 'Weekly Intelligence Update',
    note: raw,
    type: 'gemini'
  };
  strategies.unshift(s);
  save('strategies', strategies);
  save('news', newsItems.slice(0, 100));
  save('spotlights', spotlights.slice(0, 20));
  document.getElementById('strategy-raw').value = '';
  renderStrategy();
}

function addManualStrategy() {
  var note = document.getElementById('strat-note').value.trim();
  if (!note) return;
  var s = {
    id: Date.now(),
    week: document.getElementById('strat-week').value || new Date().toLocaleDateString(),
    topic: document.getElementById('strat-topic').value || 'Strategy Note',
    note: note,
    type: 'manual'
  };
  strategies.unshift(s);
  save('strategies', strategies);
  ['strat-week', 'strat-topic', 'strat-note'].forEach(function(id) { document.getElementById(id).value = ''; });
  renderStrategy();
}

function deleteStrategy(id) {
  strategies = strategies.filter(function(x) { return x.id !== id; });
  save('strategies', strategies);
  renderStrategy();
}

function deleteNews(id) {
  newsItems = newsItems.filter(function(x) { return x.id !== id; });
  save('news', newsItems);
  renderStrategy();
}

function deleteSpotlight(id) {
  spotlights = spotlights.filter(function(x) { return x.id !== id; });
  save('spotlights', spotlights);
  renderStrategy();
}

function renderStrategy() {
  renderStrategyNudge();
  var newsEl = document.getElementById('gemini-news-list');
  var newsSec = document.getElementById('gemini-news-section');
  if (newsEl && newsItems.length) {
    newsSec.style.display = 'block';
    newsEl.innerHTML = newsItems.map(function(st) {
      var rel = st.relevant !== false && st.relevance;
      return '<div class="hand-card" style="border-left:4px solid var(--blue);border-radius:0 12px 12px 0;border-top:1px solid var(--rim);border-right:1px solid var(--rim);border-bottom:1px solid var(--rim);margin-bottom:.6rem">'
        + '<div style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:rgba(255,255,255,.3);margin-bottom:.35rem">' + esc(st.week || '') + '</div>'
        + '<div class="hand-title">' + esc(st.headline) + '</div>'
        + '<div class="hand-body" style="margin-top:.4rem">' + esc(st.body) + '</div>'
        + (st.source ? '<div style="margin-top:.5rem;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.3)">📍 ' + esc(st.source) + '</div>' : '')
        + (rel ? '<div style="margin-top:.5rem;font-size:11px;color:var(--gold);font-family:var(--mono)">→ Bob: ' + esc(st.relevance) + '</div>' : '')
        + '<button class="del-btn" style="margin-top:.4rem" onclick="deleteNews(' + st.id + ')">✕ remove</button>'
        + '</div>';
    }).join('');
  }

  var spotEl = document.getElementById('gemini-spotlight-card');
  var spotSec = document.getElementById('gemini-spotlight-section');
  if (spotEl && spotlights.length) {
    spotSec.style.display = 'block';
    spotEl.innerHTML = spotlights.map(function(sp) {
      return '<div class="strategy-card" style="border-left-color:var(--gold);margin-bottom:.6rem">'
        + '<div style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:rgba(255,255,255,.3);margin-bottom:.35rem">' + esc(sp.week || '') + '</div>'
        + '<p>' + esc(sp.content) + '</p>'
        + (sp.source ? '<div style="margin-top:.5rem;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.3)">📍 ' + esc(sp.source) + '</div>' : '')
        + '<button class="del-btn" style="margin-top:.4rem" onclick="deleteSpotlight(' + sp.id + ')">✕ remove</button>'
        + '</div>';
    }).join('');
  }

  var el = document.getElementById('strategy-list');
  if (!el) return;
  if (!strategies.length) {
    el.innerHTML = '<div style="padding:2rem;text-align:center;color:rgba(255,255,255,.2);font-family:var(--mono);font-size:13px">No strategy notes yet. Import a weekly briefing or add a manual note.</div>';
    return;
  }
  el.innerHTML = strategies.map(function(s) {
    return '<div class="strategy-card"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem"><div><div class="strategy-week">' + (s.type === 'gemini' ? '♠ WEEKLY BRIEFING' : '♦ MANUAL NOTE') + ' · ' + esc(s.week) + '</div><h4>' + esc(s.topic) + '</h4></div><button class="del-btn" onclick="deleteStrategy(' + s.id + ')">✕</button></div><p style="margin-top:.5rem">' + esc(s.note) + '</p></div>';
  }).join('');
}

function parseGeminiJSON() {
  var raw = document.getElementById('strategy-raw').value.trim();
  if (!raw) return;

  var data = null;
  try {
    var js = raw.indexOf('{'), je = raw.lastIndexOf('}');
    if (js !== -1 && je !== -1) data = JSON.parse(raw.substring(js, je + 1));
  } catch (e) {}

  if (!data || !data.sections) {
    alert('Could not parse JSON. Check your Gemini output and try again.');
    return;
  }

  var imported = { calendars: [], news: [], strategies: [], spotlight: null, watch: null };
  data.sections.forEach(function(sec) {
    if (sec.id === 'ph_calendar' || sec.id === 'apac_calendar') {
      (sec.events || []).forEach(function(ev) {
        var br = bankroll.amount || 0, rule = bankroll.rule || 15;
        var rec = br / rule, stretch = br / (rule * 0.6);
        var bi = parseFloat(ev.buyin) || 0;
        var status = bi <= rec ? 'target' : bi <= stretch ? 'stretch' : 'skip';
        var t = {
          id: Date.now() + Math.random(),
          date: ev.date || '',
          day: ev.day || '',
          month: ev.month || '',
          series: ev.series || ev.name || 'Tournament',
          name: ev.name || 'Tournament',
          type: ev.type || 'side',
          venue: ev.venue || '',
          buyin: bi,
          gtd: ev.guarantee || '',
          structure: ev.structure || 'Regular',
          notes: ev.notes || '',
          source: ev.source || '',
          status: status
        };
        var exists = tourneys.some(function(x) { return x.name === t.name && x.date === t.date; });
        if (!exists) {
          tourneys.push(t);
          imported.calendars.push(t);
        }
      });
    }

    if (sec.id === 'news') {
      (sec.stories || []).forEach(function(st) {
        var tagged = {
          id: Date.now() + Math.random(),
          week: data.week || new Date().toLocaleDateString(),
          headline: st.headline || '',
          body: st.body || '',
          source: st.source || '',
          relevant: st.relevant,
          relevance: st.relevance || ''
        };
        var exists = newsItems.some(function(x) { return x.headline === tagged.headline; });
        if (!exists) {
          newsItems.unshift(tagged);
          imported.news.push(tagged);
        }
      });
    }

    if (sec.id === 'strategy') {
      (sec.insights || []).forEach(function(ins) {
        var s = {
          id: Date.now() + Math.random(),
          week: data.week || new Date().toLocaleDateString(),
          topic: ins.topic || 'Strategy Insight',
          note: (ins.concept || '') + (ins.application ? ' In practice: ' + ins.application : ''),
          source: ins.source || '',
          type: 'gemini'
        };
        strategies.unshift(s);
        imported.strategies.push(s);
      });
    }

    if (sec.id === 'spotlight') {
      var sp = { id: Date.now() + Math.random(), week: data.week || '', content: sec.content || '', source: sec.source || '' };
      var spExists = spotlights.some(function(x) { return x.content === sp.content; });
      if (!spExists) spotlights.unshift(sp);
      imported.spotlight = sp;
    }
  });

  if (data.watch) imported.watch = { text: data.watch, source: data.watch_source || '' };

  if (imported.calendars.length) {
    tourneys.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    save('tourneys', tourneys);
  }
  save('strategies', strategies);
  document.getElementById('strategy-raw').value = '';
  renderStrategy();
  renderCalendar();

  var msg = 'Gemini briefing imported:\n';
  if (imported.calendars.length) msg += '• ' + imported.calendars.length + ' tournament(s) added to Calendar\n';
  if (imported.strategies.length) msg += '• ' + imported.strategies.length + ' strategy insight(s) added\n';
  if (imported.news.length) msg += '• ' + imported.news.length + ' news stories rendered\n';
  if (imported.spotlight) msg += '• Weekly spotlight captured\n';
  alert(msg);
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
