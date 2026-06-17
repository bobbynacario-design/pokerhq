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

function canonicalTourneyDate(t) {
  // Collapse every date shape a briefing might use (full string, range, or
  // separate day/month fields) into one stable key, so the same real event
  // doesn't re-import just because the next briefing formatted the date
  // differently. Falls back to the raw date string when it can't be parsed.
  if (typeof parseTourneyDateRange === 'function') {
    var range = parseTourneyDateRange(t);
    if (range && range.start && typeof toDateInputValue === 'function') {
      var startKey = toDateInputValue(range.start);
      if (startKey) return startKey + '..' + (toDateInputValue(range.end) || startKey);
    }
  }
  return normalizeImportToken(t.date);
}

function getImportedTourneyFingerprint(t) {
  // Stable identity = when + what + where. Volatile fields (buyin, gtd,
  // structure, notes, series/type labels, redundant day/month) are
  // deliberately excluded so a regenerated briefing with cosmetic
  // differences won't create duplicate calendar events.
  return [
    canonicalTourneyDate(t),
    normalizeImportToken(t.name),
    normalizeImportToken(t.venue)
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
        var bi = parseFloat(ev.buyin) || 0;
        var status = gradeBuyin(bi);
        var t = {
          id: Date.now() + Math.random(),
          date: ev.date || '',
          time: ev.time || '',
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
var _lastResearchMeta = {};

// Normalise a URL to host+path (drop protocol/www/query/hash/trailing slash) so
// the source URL Claude reports can be matched against what its searches actually
// retrieved — strict on purpose: a false "verified" is worse than a false "unverified".
function _normUrl(u) {
  var s = String(u || '').trim();
  if (!s) return '';
  try {
    var x = new URL(s);
    return x.hostname.replace(/^www\./i, '').toLowerCase() + x.pathname.replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[#?].*$/, '').replace(/\/+$/, '');
  }
}

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
    + 'Base every factual claim, date, and result strictly on what your web searches return — do not rely on prior knowledge, and do not include anything you did not find in a search result.\n\n'
    + 'Then respond with ONLY a single valid JSON object — no preamble, no explanation, no markdown code fences. Use exactly this shape:\n'
    + '{"asOf":"' + today + '","items":[{"category":"news|event|strategy","headline":"specific, informative headline","summary":"a detailed 4-6 sentence brief: the concrete specifics (names, dates, venues, buy-ins or guarantees, key results or numbers) AND why it matters to a tournament player","date":"approx date or date range","source":"publication or organiser name","url":"https://..."}]}\n'
    + 'Make each summary genuinely useful and substantive — not a one-liner. Include the concrete figures and details a player would want.\n'
    + 'The "url" for each item MUST be copied exactly from one of the result URLs your searches returned — never invent, guess, or construct a URL. '
    + 'Run several searches across different sources and aim for 6 to 8 substantive, well-sourced items — do not stop at two or three. Only drop an item if you genuinely cannot verify it from a search result; prefer finding and sourcing more over returning a thin list.';
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
        model: 'claude-opus-4-8',
        max_tokens: 6000,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8 }],
        messages: [{ role: 'user', content: buildResearchPrompt() }]
      })
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error('API key was rejected (401) — check it in the AI Assistant panel.');
      throw new Error('Claude API error (' + response.status + ')');
    }
    var data = await response.json();
    // Ground-truth guard against hallucination: collect the URLs Claude's searches
    // ACTUALLY retrieved (web_search_tool_result blocks) + cited (citations). Any
    // item whose URL is not in this set is flagged unverified; if no search ran at
    // all, every item is unverified.
    var verifySet = {}, citedByUrl = {}, ageByUrl = {}, searchErrors = [], searchCount = 0;
    (data.content || []).forEach(function(b) {
      if (b.type === 'server_tool_use' && b.name === 'web_search') searchCount++;
      if (b.type === 'web_search_tool_result') {
        var c = b.content;
        if (c && c.type === 'web_search_tool_result_error') { if (c.error_code) searchErrors.push(c.error_code); return; }
        (Array.isArray(c) ? c : []).forEach(function(r) {
          if (r && r.url) { var k = _normUrl(r.url); verifySet[k] = true; if (r.page_age && !ageByUrl[k]) ageByUrl[k] = r.page_age; }
        });
      }
      if (b.type === 'text' && Array.isArray(b.citations)) {
        b.citations.forEach(function(ct) {
          if (ct && ct.url) { var k = _normUrl(ct.url); verifySet[k] = true; if (ct.cited_text && !citedByUrl[k]) citedByUrl[k] = ct.cited_text; }
        });
      }
    });
    if (data.usage && data.usage.server_tool_use && typeof data.usage.server_tool_use.web_search_requests === 'number') {
      searchCount = data.usage.server_tool_use.web_search_requests;
    }
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
    parsed.items.forEach(function(it) {
      var k = _normUrl(it.url || '');
      it._verified = !!(k && verifySet[k]);
      it._cited = it._verified ? (citedByUrl[k] || '') : '';
      it._age = it._verified ? (ageByUrl[k] || '') : '';
    });
    renderResearchResults(parsed.items, parsed.asOf, { searchCount: searchCount, errors: searchErrors });
    var vCount = parsed.items.filter(function(it) { return it._verified; }).length;
    setResearchStatus('✓ ' + parsed.items.length + ' update(s) · ' + vCount + ' with a verified source. Review before saving.', vCount ? 'ok' : 'muted');
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

function renderResearchResults(items, asOf, meta) {
  var el = document.getElementById('ai-research-results');
  if (!el) return;
  meta = meta || {};
  _lastResearch = items.slice();
  _lastResearchMeta = meta;
  var verifiedCount = _lastResearch.filter(function(it) { return it._verified; }).length;

  var banner = '';
  if (!meta.searchCount) {
    banner = '<div class="research-warn">⚠ Claude returned these without searching the web — treat every item as unverified and open the sources before trusting them.</div>';
  } else if ((meta.errors || []).length) {
    banner = '<div class="research-warn">⚠ A web search was capped or rate-limited (' + esc((meta.errors || []).join(', ')) + ') — results may be incomplete.</div>';
  }

  var head = '<div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-bottom:.6rem;flex-wrap:wrap">'
    + '<div style="font-family:var(--mono);font-size:10px;letter-spacing:.08em;color:var(--muted-strong)">RESEARCH RESULTS' + (asOf ? ' · ' + esc(asOf) : '') + '</div>'
    + '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'
    + '<button class="sec-action" onclick="saveAllPokerResearch()">SAVE ALL VERIFIED' + (verifiedCount ? ' (' + verifiedCount + ')' : '') + ' ↓</button>'
    + '<button class="sec-action" onclick="dismissPokerResearch()">DISMISS</button>'
    + '</div></div>';

  var cards = _lastResearch.map(function(it, i) {
    var cat = researchCategoryMeta(it.category);
    var urlOk = /^https?:\/\//i.test(it.url || '');
    var border = it._verified ? cat.color : '#F0A832';
    var badge = it._verified
      ? '<span class="research-badge research-badge-ok">✓ VERIFIED SOURCE</span>'
      : '<span class="research-badge research-badge-warn">⚠ UNVERIFIED</span>';
    var dateBits = [];
    if (it.date) dateBits.push(esc(it.date));
    if (it._age) dateBits.push('src ' + esc(it._age));
    return '<div class="hand-card" style="border-left:4px solid ' + border + ';border-radius:0 12px 12px 0;border-top:1px solid var(--rim);border-right:1px solid var(--rim);border-bottom:1px solid var(--rim);margin-bottom:.6rem' + (it._verified ? '' : ';opacity:.9') + '">'
      + '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.35rem">'
      + '<span style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:' + cat.color + '">' + cat.label + '</span>'
      + badge
      + (dateBits.length ? '<span style="font-family:var(--mono);font-size:9px;color:rgba(255,255,255,.3)">' + dateBits.join(' · ') + '</span>' : '')
      + '</div>'
      + '<div class="hand-title">' + esc(it.headline) + '</div>'
      + '<div class="hand-body" style="margin-top:.4rem">' + esc(it.summary) + '</div>'
      + (it._cited ? '<div class="research-quote">“' + esc(String(it._cited).slice(0, 160)) + '”</div>' : '')
      + (it.source || urlOk ? '<div style="margin-top:.5rem;font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.35)">📍 ' + (urlOk ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer" style="color:var(--blue)">' + esc(it.source || it.url) + '</a>' : esc(it.source)) + '</div>' : '')
      + '<button class="sec-action primary" style="margin-top:.55rem" onclick="savePokerResearchItem(' + i + ')">+ SAVE' + (it._verified ? '' : ' ANYWAY') + '</button>'
      + '</div>';
  }).join('');

  el.innerHTML = banner + head + cards;
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
  var verified = _lastResearch.filter(function(it) { return it._verified; });
  if (!verified.length) {
    setResearchStatus('Nothing has a verified source — open the links and use “Save anyway” for any you trust.', 'muted');
    return;
  }
  var n = 0;
  verified.forEach(function(it) { if (_commitResearchItem(it)) n++; });
  var remaining = _lastResearch.filter(function(it) { return !it._verified; });
  renderStrategy();
  if (remaining.length) {
    renderResearchResults(remaining, null, _lastResearchMeta);
    setResearchStatus('✓ Saved ' + n + ' verified item(s). ' + remaining.length + ' unverified left below — review and save any you trust.', 'ok');
  } else {
    dismissPokerResearch();
    setResearchStatus('✓ Saved ' + n + ' verified item(s) to your feed.', 'ok');
  }
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
