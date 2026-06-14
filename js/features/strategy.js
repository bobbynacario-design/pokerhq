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
  var idx = strategies.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removed = strategies[idx];
  strategies = strategies.filter(function(x) { return x.id !== id; });
  window.strategies = strategies;
  save('strategies', strategies);
  renderStrategy();
  if (typeof showUndoToast === 'function') showUndoToast('Strategy note deleted: ' + (removed.topic || ''), function() {
    strategies.splice(Math.min(idx, strategies.length), 0, removed);
    window.strategies = strategies;
    save('strategies', strategies);
    renderStrategy();
  });
}

function deleteNews(id) {
  var idx = newsItems.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removed = newsItems[idx];
  newsItems = newsItems.filter(function(x) { return x.id !== id; });
  window.newsItems = newsItems;
  save('news', newsItems);
  renderStrategy();
  if (typeof showUndoToast === 'function') showUndoToast('News story deleted', function() {
    newsItems.splice(Math.min(idx, newsItems.length), 0, removed);
    window.newsItems = newsItems;
    save('news', newsItems);
    renderStrategy();
  });
}

function deleteSpotlight(id) {
  var idx = spotlights.findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removed = spotlights[idx];
  spotlights = spotlights.filter(function(x) { return x.id !== id; });
  window.spotlights = spotlights;
  save('spotlights', spotlights);
  renderStrategy();
  if (typeof showUndoToast === 'function') showUndoToast('Spotlight deleted', function() {
    spotlights.splice(Math.min(idx, spotlights.length), 0, removed);
    window.spotlights = spotlights;
    save('spotlights', spotlights);
    renderStrategy();
  });
}

function renderStrategy() {
  renderStrategyNudge();
  if (typeof renderAiSettings === 'function') renderAiSettings();
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
        + (st.source || /^https?:\/\//i.test(st.url || '') ? '<div style="margin-top:.5rem;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.3)">📍 ' + (/^https?:\/\//i.test(st.url || '') ? '<a href="' + esc(st.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">' + esc(st.source || st.url) + '</a>' : esc(st.source)) + '</div>' : '')
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

function normalizeImportToken(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getImportedTourneyFingerprint(t) {
  return [
    normalizeImportToken(t.date),
    normalizeImportToken(t.day),
    normalizeImportToken(t.month),
    normalizeImportToken(t.series),
    normalizeImportToken(t.name),
    normalizeImportToken(t.venue),
    normalizeImportToken(t.type),
    String(Math.round((parseFloat(t.buyin) || 0) * 100))
  ].join('|');
}

function getImportedStrategyFingerprint(s) {
  return [
    normalizeImportToken(s.week),
    normalizeImportToken(s.topic),
    normalizeImportToken(s.note),
    normalizeImportToken(s.source),
    normalizeImportToken(s.type)
  ].join('|');
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
        var tfp = getImportedTourneyFingerprint(t);
        var exists = tourneys.some(function(x) { return getImportedTourneyFingerprint(x) === tfp; });
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
        var sfp = getImportedStrategyFingerprint(s);
        var exists = strategies.some(function(x) { return getImportedStrategyFingerprint(x) === sfp; });
        if (!exists) {
          strategies.unshift(s);
          imported.strategies.push(s);
        }
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
    window.tourneys = tourneys;
    tourneys.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    save('tourneys', tourneys);
  }
  window.strategies = strategies;
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

// ── AI POKER RESEARCH ──
// Claude searches the web (Anthropic web_search server tool) for current poker
// news / notable events, then returns a compact JSON the user can file into the
// existing news feed and strategy notes. Reuses the device-local Anthropic key.
var _lastResearch = [];

function onResearchFocusChange() {
  var sel = document.getElementById('ai-research-focus');
  var row = document.getElementById('ai-research-custom-row');
  if (!sel || !row) return;
  row.style.display = sel.value === 'custom' ? '' : 'none';
}

function setResearchStatus(message, kind) {
  var el = document.getElementById('ai-research-status');
  if (!el) return;
  if (!message) { el.style.display = 'none'; el.textContent = ''; return; }
  var color = kind === 'ok' ? 'var(--green)' : kind === 'error' ? 'var(--red)' : 'var(--muted-strong)';
  el.style.display = 'block';
  el.style.color = color;
  el.textContent = message;
}

function buildResearchPrompt() {
  var sel = document.getElementById('ai-research-focus');
  var focus = sel ? sel.value : 'apac';
  var today = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  var scope;
  if (focus === 'global') {
    scope = 'the global tournament poker scene — major live festivals and online series worldwide (WSOP, WPT, EPT, Triton, GGPoker, PokerStars), notable results and records, and significant industry or rule changes';
  } else if (focus === 'strategy') {
    scope = 'poker strategy and training developments — new solver / GTO tooling, widely-discussed strategic concepts, notable training content, and meta shifts in tournament play';
  } else if (focus === 'custom') {
    var customEl = document.getElementById('ai-research-custom');
    var custom = customEl ? String(customEl.value || '').trim() : '';
    scope = custom ? ('this specific topic, for a tournament poker player: ' + custom) : 'the latest notable poker news and events worth knowing';
  } else {
    scope = 'the poker scene most relevant to a tournament player based in the Philippines — the Manila live circuit (Solaire, Okada, PokerStars / APPT Manila) and the wider Asia-Pacific tournament circuit, plus the major global events (WSOP, EPT, Triton) worth knowing about';
  }
  return 'You are a poker intelligence researcher for a serious tournament player. Today is ' + today + '. '
    + 'Use web search to find the most current and noteworthy updates about ' + scope + '. '
    + 'Prioritise items from roughly the last 1-2 months: recent tournament results and records, upcoming notable festivals / series with their dates and venues, and significant strategy or industry developments. '
    + 'Verify every fact against your search results and include a real source URL for each item.\n\n'
    + 'Then respond with ONLY a single valid JSON object — no preamble, no explanation, no markdown code fences. Use exactly this shape:\n'
    + '{"asOf":"' + today + '","items":[{"category":"news|event|strategy","headline":"short headline","summary":"2-3 sentence summary of what happened or what is coming, and why it matters to a tournament player","date":"approx date or date range","source":"publication or organiser name","url":"https://..."}]}\n'
    + 'Return 5 to 8 items, most relevant and most recent first. Omit anything you cannot verify from your searches.';
}

async function runPokerResearch() {
  var key = (typeof getStoredAnthropicKey === 'function') ? getStoredAnthropicKey() : '';
  if (!key) {
    setResearchStatus('Add your Anthropic API key in the AI Assistant panel above first.', 'error');
    return;
  }
  var btn = document.getElementById('ai-research-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ RESEARCHING…'; }
  setResearchStatus('🔎 Searching the web for the latest poker updates… this usually takes 20-40s.', 'muted');
  dismissPokerResearch();

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
        messages: [{ role: 'user', content: buildResearchPrompt() }]
      })
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('API key was rejected (401) — check it in the AI Assistant panel.');
      throw new Error('Claude API error (' + response.status + ')');
    }
    var data = await response.json();
    // The web-search loop runs server-side; the response interleaves search blocks
    // with text. We only need Claude's final synthesised JSON, so join text blocks.
    var text = (data.content || [])
      .filter(function(c) { return c.type === 'text'; })
      .map(function(c) { return c.text || ''; })
      .join('\n');
    var parsed = null;
    try {
      var js = text.indexOf('{'), je = text.lastIndexOf('}');
      if (js !== -1 && je !== -1) parsed = JSON.parse(text.substring(js, je + 1));
    } catch (e) {}
    if (!parsed || !parsed.items || !parsed.items.length) {
      throw new Error('No usable results came back. Try again or narrow the focus.');
    }
    renderResearchResults(parsed.items, parsed.asOf);
    setResearchStatus('✓ Found ' + parsed.items.length + ' update(s). Save the ones worth keeping.', 'ok');
  } catch (e) {
    setResearchStatus('✗ ' + e.message, 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🔎 RESEARCH LATEST UPDATES'; }
}

function researchCategoryMeta(cat) {
  if (cat === 'strategy') return { label: 'STRATEGY', color: 'var(--gold)' };
  if (cat === 'event') return { label: 'EVENT', color: 'var(--green)' };
  return { label: 'NEWS', color: 'var(--blue)' };
}

function renderResearchResults(items, asOf) {
  var el = document.getElementById('ai-research-results');
  if (!el) return;
  _lastResearch = items.slice();
  var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-bottom:.6rem;flex-wrap:wrap">'
    + '<div style="font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--muted-strong)">RESEARCH RESULTS' + (asOf ? ' · ' + esc(asOf) : '') + '</div>'
    + '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'
    + '<button class="sec-action" onclick="saveAllPokerResearch()">SAVE ALL ↓</button>'
    + '<button class="sec-action" onclick="dismissPokerResearch()">DISMISS</button>'
    + '</div></div>';
  var cards = _lastResearch.map(function(it, i) {
    var meta = researchCategoryMeta(it.category);
    var urlOk = /^https?:\/\//i.test(it.url || '');
    return '<div class="hand-card" style="border-left:4px solid ' + meta.color + ';border-radius:0 12px 12px 0;border-top:1px solid var(--rim);border-right:1px solid var(--rim);border-bottom:1px solid var(--rim);margin-bottom:.6rem">'
      + '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem">'
      + '<span style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:' + meta.color + '">' + meta.label + '</span>'
      + (it.date ? '<span style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3)">' + esc(it.date) + '</span>' : '')
      + '</div>'
      + '<div class="hand-title">' + esc(it.headline) + '</div>'
      + '<div class="hand-body" style="margin-top:.4rem">' + esc(it.summary) + '</div>'
      + (it.source || urlOk ? '<div style="margin-top:.5rem;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.35)">📍 ' + (urlOk ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">' + esc(it.source || it.url) + '</a>' : esc(it.source)) + '</div>' : '')
      + '<button class="sec-action primary" style="margin-top:.55rem" onclick="savePokerResearchItem(' + i + ')">+ SAVE</button>'
      + '</div>';
  }).join('');
  el.innerHTML = head + cards;
  el.style.display = 'block';
}

function _commitResearchItem(it) {
  if (!it) return;
  var asOf = new Date().toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
  var url = /^https?:\/\//i.test(it.url || '') ? it.url : '';
  if (it.category === 'strategy') {
    strategies.unshift({
      id: Date.now() + Math.random(),
      week: it.date || asOf,
      topic: it.headline || 'Strategy Insight',
      note: it.summary || '',
      source: it.source || '',
      url: url,
      type: 'gemini'
    });
    window.strategies = strategies;
    save('strategies', strategies.slice(0, 200));
    return true;
  }
  var exists = newsItems.some(function(x) { return x.headline === it.headline; });
  if (exists) return false;
  newsItems.unshift({
    id: Date.now() + Math.random(),
    week: it.date || asOf,
    headline: it.headline || '',
    body: it.summary || '',
    source: it.source || '',
    url: url,
    relevant: true,
    relevance: ''
  });
  window.newsItems = newsItems;
  save('news', newsItems.slice(0, 100));
  return true;
}

function savePokerResearchItem(i) {
  var it = _lastResearch[i];
  if (!it) return;
  var added = _commitResearchItem(it);
  renderStrategy();
  setResearchStatus(added
    ? '✓ Saved “' + String(it.headline || 'item').slice(0, 44) + '”.'
    : 'Already in your feed — skipped duplicate.', added ? 'ok' : 'muted');
}

function saveAllPokerResearch() {
  if (!_lastResearch.length) return;
  var n = 0;
  _lastResearch.forEach(function(it) { if (_commitResearchItem(it)) n++; });
  dismissPokerResearch();
  renderStrategy();
  setResearchStatus('✓ Saved ' + n + ' item(s) to your feed.', 'ok');
}

function dismissPokerResearch() {
  _lastResearch = [];
  var el = document.getElementById('ai-research-results');
  if (el) { el.style.display = 'none'; el.innerHTML = ''; }
}

function esc(s) {
  return String(s === null || typeof s === 'undefined' ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
