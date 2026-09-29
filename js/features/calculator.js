var _calcPresets = {
  3:  [50, 30, 20],
  5:  [40, 25, 16, 11, 8],
  9:  [32, 20, 13, 9, 7, 6, 5, 4.5, 3.5],
  10: [30, 18, 12, 9, 7, 6, 5, 4.5, 4, 3.5]
};
var _calcPcts = [];
var _calcNumPlaces = 0;
var _calcCustomDebounceTimer = null;

function calcSwitchMode(mode) {
  document.querySelectorAll('.calc-mode-btn').forEach(function(b){ b.classList.remove('active'); });
  document.querySelectorAll('.calc-panel').forEach(function(p){ p.classList.remove('active'); });
  document.getElementById('calc-btn-'+mode).classList.add('active');
  document.getElementById('calc-panel-'+mode).classList.add('active');
  if (mode === 'risk') {
    calcRiskSyncDefaults();
    calcRiskEngine();
  }
}

function calcPlacesChanged() {
  var sel = document.getElementById('calc-places');
  var customWrap = document.getElementById('calc-custom-places-wrap');
  if (sel.value === 'custom') {
    customWrap.style.display = '';
    document.getElementById('calc-custom-places').value = '';
    _calcPcts = [];
    _calcNumPlaces = 0;
    document.getElementById('calc-pct-editor').innerHTML = '';
    document.getElementById('calc-payout-results').innerHTML = '';
    document.getElementById('calc-payout-total').textContent = '';
  } else {
    customWrap.style.display = 'none';
    var n = parseInt(sel.value) || 0;
    if (n > 0) {
      _calcNumPlaces = n;
      if (_calcPresets[n]) {
        _calcPcts = _calcPresets[n].slice();
      } else {
        _calcPcts = [];
        while (_calcPcts.length < n) _calcPcts.push(0);
      }
      calcRenderPctEditor();
      calcPayouts();
    }
  }
}

function generateCustomStructure(places) {
  if (places < 1) return [];
  if (places === 1) return [100];
  var decay = 0.75;
  var raw = [];
  for (var i = 0; i < places; i++) raw.push(Math.pow(decay, i));
  var total = raw.reduce(function(a, b){ return a + b; }, 0);
  var pcts = raw.map(function(v){ return Math.round((v / total) * 1000) / 10; });
  var sum = pcts.reduce(function(a, b){ return a + b; }, 0);
  pcts[0] = Math.round((pcts[0] + Math.round((100 - sum) * 10) / 10) * 10) / 10;
  return pcts;
}

function calcCustomPlacesDebounced() {
  clearTimeout(_calcCustomDebounceTimer);
  _calcCustomDebounceTimer = setTimeout(function() {
    var n = parseInt(document.getElementById('calc-custom-places').value) || 0;
    if (n < 1 || n > 100) return;
    _calcNumPlaces = n;
    if (_calcPresets[n]) {
      _calcPcts = _calcPresets[n].slice();
    } else {
      _calcPcts = generateCustomStructure(n);
    }
    calcRenderPctEditor();
    calcPayouts();
  }, 500);
}

function calcApplyPreset(n) {
  _calcPcts = _calcPresets[n].slice();
  _calcNumPlaces = n;
  var sel = document.getElementById('calc-places');
  if (sel) {
    var found = false;
    for (var i = 0; i < sel.options.length; i++) {
      if (parseInt(sel.options[i].value) === n) { sel.value = String(n); found = true; break; }
    }
    if (!found) sel.value = 'custom';
  }
  document.getElementById('calc-custom-places-wrap').style.display = 'none';
  calcRenderPctEditor();
  calcPayouts();
}

function ordinal(n) {
  var s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

function calcRenderPctEditor() {
  if (!_calcPcts.length) { document.getElementById('calc-pct-editor').innerHTML = ''; return; }
  var total = _calcPcts.reduce(function(a,b){ return a+b; }, 0);
  var tcolor = Math.abs(total-100) < 0.15 ? 'var(--green)' : 'var(--red)';
  var warn   = Math.abs(total-100) >= 0.15 ? ' ⚠ must equal 100%' : ' ✓';
  var html = '<div style="display:flex;flex-wrap:wrap;gap:.5rem .75rem;align-items:center;margin-bottom:.5rem">';
  for (var i=0; i<_calcPcts.length; i++) {
    html += '<div style="display:flex;align-items:center;gap:.3rem">';
    html += '<span style="font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.4)">'+ordinal(i+1)+'</span>';
    html += '<input class="pct-input" type="number" step="0.5" min="0" max="100" value="'+_calcPcts[i]+'" data-idx="'+i+'" oninput="onPercentChange(+this.getAttribute(\'data-idx\'))">';
    html += '<span style="font-family:var(--mono);font-size:10px;color:rgba(255,255,255,.3)">%</span>';
    html += '</div>';
  }
  html += '</div>';
  html += '<div id="calc-pct-total" style="font-family:var(--mono);font-size:10px;color:'+tcolor+'">Total: '+total.toFixed(1)+'%'+warn+'</div>';
  document.getElementById('calc-pct-editor').innerHTML = html;
}

function onPercentChange(editedIndex) {
  var inputs = document.querySelectorAll('.pct-input');
  var editedVal = parseFloat(inputs[editedIndex].value) || 0;

  if (editedVal > 100) { editedVal = 100; inputs[editedIndex].value = 100; }
  _calcPcts[editedIndex] = editedVal;

  var remaining = 100 - editedVal;
  var others = [];
  var otherTotal = 0;
  inputs.forEach(function(inp, i) {
    if (i !== editedIndex) {
      var v = parseFloat(inp.value) || 0;
      others.push({ el: inp, idx: i, val: v });
      otherTotal += v;
    }
  });

  if (others.length === 0) { calcPayouts(); return; }

  if (otherTotal === 0) {
    var share = Math.round(remaining / others.length * 10) / 10;
    others.forEach(function(o) {
      o.el.value = share;
      _calcPcts[o.idx] = share;
    });
  } else {
    others.forEach(function(o) {
      var newVal = Math.round((o.val / otherTotal) * remaining * 10) / 10;
      o.el.value = newVal;
      _calcPcts[o.idx] = newVal;
    });
  }

  if (_calcPcts.length >= 2 && _calcPcts[0] < _calcPcts[1]) {
    var tmp = _calcPcts[0]; _calcPcts[0] = _calcPcts[1]; _calcPcts[1] = tmp;
    if (inputs[0]) inputs[0].value = _calcPcts[0];
    if (inputs[1]) inputs[1].value = _calcPcts[1];
  }

  var finalTotal = _calcPcts.reduce(function(a,b){ return a+b; }, 0);
  var ok = Math.abs(finalTotal - 100) < 0.5;
  var totEl = document.getElementById('calc-pct-total');
  if (totEl) {
    totEl.style.color = ok ? 'var(--green)' : 'var(--red)';
    totEl.textContent = 'Total: ' + Math.round(finalTotal * 10) / 10 + '%' + (ok ? ' ✓' : ' ⚠ must equal 100%');
  }

  calcPayouts();
}

function calcPayouts() {
  var pool = parseFloat(document.getElementById('calc-pool').value) || 0;
  var resultsEl = document.getElementById('calc-payout-results');
  var totalEl   = document.getElementById('calc-payout-total');
  if (!pool || !_calcPcts.length) {
    resultsEl.innerHTML = '';
    totalEl.textContent = '';
    return;
  }
  var html = '';
  var totalPayout = 0;
  for (var i=0; i<_calcPcts.length; i++) {
    var pct    = _calcPcts[i];
    var amount = pool * pct / 100;
    totalPayout += amount;
    html += '<div class="calc-result-item">';
    html += '<div class="calc-result-place">'+ordinal(i+1)+' Place</div>';
    html += '<div class="calc-result-pct">'+pct.toFixed(1)+'%</div>';
    html += '<div class="calc-result-amount">₱'+Math.round(amount).toLocaleString()+'</div>';
    html += '</div>';
  }
  resultsEl.innerHTML = html;
  totalEl.textContent = 'Total: ₱'+Math.round(totalPayout).toLocaleString()+' across '+_calcPcts.length+' place'+((_calcPcts.length!==1)?'s':'');
}

// Antes are a table-wide setting, so remember the choice on this device.
var CALC_ANTE_STORAGE_KEY = 'pokerhq_calc_ante';
(function calcRestoreAnte() {
  try {
    var el = document.getElementById('calc-ante');
    if (el && localStorage.getItem(CALC_ANTE_STORAGE_KEY) === '1') el.value = '1';
  } catch (e) {}
})();

function calcAnteChanged() {
  try {
    var el = document.getElementById('calc-ante');
    localStorage.setItem(CALC_ANTE_STORAGE_KEY, el && el.value === '1' ? '1' : '0');
  } catch (e) {}
  calcStackAdvisor();
}

// Stack & Bubble advisor. Ranges come from js/data/pushfold.js: a position-aware
// chip-EV open-shove baseline (first in, nobody has raised) — not an ICM solve.
function calcStackAdvisor() {
  var stack   = parseFloat(document.getElementById('calc-stack').value)  || 0;
  var bb      = parseFloat(document.getElementById('calc-bb').value)     || 0;
  var players = parseInt(document.getElementById('calc-players').value)  || 0;
  var paid    = parseInt(document.getElementById('calc-paid').value)     || 0;
  var emptyEl   = document.getElementById('calc-advisor-empty');
  var resultsEl = document.getElementById('calc-advisor-results');
  if (!stack || !bb || !players || !paid) {
    emptyEl.style.display   = '';
    resultsEl.style.display = 'none';
    return;
  }
  emptyEl.style.display   = 'none';
  resultsEl.style.display = '';

  var ante = document.getElementById('calc-ante').value === '1';
  var posKey = document.getElementById('calc-position').value;
  var bbDepth          = stack / bb;
  var playersFromMoney = Math.max(0, players - paid);
  // Tighten only when the money is actually close: within 5% of the paid spots
  // (never fewer than 3). Once in the money there is no bubble.
  var bubbleWindow     = Math.max(3, Math.round(paid * 0.05));
  var nearBubble       = playersFromMoney >= 1 && playersFromMoney <= bubbleWindow;
  var pctPaid          = (paid / players * 100).toFixed(0);
  var advice           = PokerHQPushFold.advise({ stackBB: bbDepth, position: posKey, ante: ante, bubble: nearBubble });

  document.getElementById('adv-bb-val').textContent  = bbDepth.toFixed(1)+' BB';
  document.getElementById('adv-m-val').textContent   = 'M-ratio: '+advice.m.toFixed(1)+'x'+(ante ? ' (with antes)' : '');

  var bubbleTxt = playersFromMoney === 0
    ? 'In the money ✓'
    : playersFromMoney+' spot'+(playersFromMoney!==1?'s':'')+' from the money';
  document.getElementById('adv-bubble-val').textContent = bubbleTxt;
  document.getElementById('adv-pct-paid').textContent   = pctPaid+'% of field paid';

  var sel = advice.selected;
  var rec, cls, detail;
  if (!advice.applies) {
    rec = 'NORMAL PLAY'; cls = 'normal';
    detail = bbDepth.toFixed(1)+'BB is deeper than push/fold territory (over '+PokerHQPushFold.MAX_STACK+'BB). Play a standard raise/fold game and keep your stack flexible.';
  } else {
    rec = sel.pct >= 99 ? 'SHOVE ANY TWO' : 'SHOVE ' + Math.round(sel.pct) + '%';
    cls = bbDepth <= 7 ? 'shove' : (bbDepth <= 15 ? 'amber' : 'blue');
    detail = sel.label + ' at ' + bbDepth.toFixed(1) + 'BB: ' + sel.text + ' (' + sel.range.combos + ' combos).';
    if (bbDepth > 15) detail += ' At this depth a raise usually beats an open-shove — read this as the hands you are happy to get all-in with.';
    if (nearBubble) detail += ' Bubble pressure applied — range tightened ~15%.';
  }
  var bannerEl = document.getElementById('adv-rec-banner');
  bannerEl.className = 'calc-rec-banner '+cls;
  bannerEl.innerHTML =
    '<div class="rec-label">Recommendation</div>'+
    '<div class="rec-action">'+rec+'</div>'+
    '<div class="rec-detail">'+detail+'</div>';

  var titleEl = document.getElementById('adv-pf-title');
  var rowsEl  = document.getElementById('adv-pf-rows');
  var noteEl  = document.getElementById('adv-pf-note');
  if (titleEl) titleEl.textContent = 'Push / Fold by Position · ' + bbDepth.toFixed(1) + ' BB' + (ante ? ' · antes' : ' · no antes') + (nearBubble ? ' · bubble' : '');
  if (rowsEl) {
    rowsEl.innerHTML = advice.applies ? advice.all.map(function(p) {
      var active = p.key === sel.key;
      return '<div class="calc-pushfold-row pf-dyn' + (active ? ' active' : '') + '">'
        + '<span class="pfrow-range">' + p.label + '</span>'
        + '<span class="pfrow-pct">' + (p.pct >= 99 ? 'any two' : Math.round(p.pct * 10) / 10 + '%') + '</span>'
        + (active ? '<span class="pfrow-hands">' + (p.pct >= 99 ? 'Any two cards.' : p.text) + '</span>' : '')
        + '</div>';
    }).join('') : '';
  }
  if (noteEl) {
    noteEl.textContent = 'Approximate chip-EV baseline for a player who is first in (nobody has raised). It is not an ICM solve — pay jumps and the stack distribution move the real answer, so confirm big spots in a solver (ICMIZER / HRC).';
  }
}

// ── ICM CALCULATOR ── (maths in js/data/icm.js)
// Turns chip stacks into prize-money value and, for a call decision, shows the
// equity you need once the pay ladder is priced in.
function calcIcmFill(select, count, keep) {
  var html = '';
  for (var i = 0; i < count; i++) html += '<option value="' + i + '">Player ' + (i + 1) + '</option>';
  if (select.getAttribute('data-count') !== String(count)) {
    select.innerHTML = html;
    select.setAttribute('data-count', String(count));
    select.value = String(Math.min(keep, count - 1));
  }
}

function calcIcmRun() {
  var errEl = document.getElementById('icm-error');
  var emptyEl = document.getElementById('icm-empty');
  var resEl = document.getElementById('icm-results');
  var stacksText = document.getElementById('icm-stacks').value;
  var payoutsText = document.getElementById('icm-payouts').value;
  var heroSel = document.getElementById('icm-hero');
  var villSel = document.getElementById('icm-villain');

  function show(state, message) {
    errEl.style.display = state === 'error' ? '' : 'none';
    errEl.textContent = state === 'error' ? message : '';
    emptyEl.style.display = state === 'empty' ? '' : 'none';
    resEl.style.display = state === 'ok' ? '' : 'none';
  }
  if (!stacksText.trim() || !payoutsText.trim()) { show('empty'); return; }

  var parsed = PokerHQICM.parseInputs(stacksText, payoutsText);
  if (parsed.error) { show('error', parsed.error); return; }
  var stacks = parsed.stacks, payouts = parsed.payouts;

  calcIcmFill(heroSel, stacks.length, 0);
  calcIcmFill(villSel, stacks.length, 1);
  var hero = parseInt(heroSel.value, 10) || 0;
  var villain = parseInt(villSel.value, 10) || 0;

  var equities = PokerHQICM.icm(stacks, payouts);
  var chipTotal = stacks.reduce(function (a, b) { return a + b; }, 0);
  var prizeTotal = payouts.reduce(function (a, b) { return a + b; }, 0);
  var rows = '';
  stacks.forEach(function (chips, i) {
    var chipPct = chipTotal ? chips / chipTotal * 100 : 0;
    var icmPct = prizeTotal ? equities[i] / prizeTotal * 100 : 0;
    var diff = icmPct - chipPct;
    var cls = diff > 0.05 ? 'profit-pos' : (diff < -0.05 ? 'profit-neg' : 'profit-zero');
    rows += '<tr' + (i === hero ? ' style="font-weight:600"' : '') + '><td>Player ' + (i + 1) + (i === hero ? '<span class="icm-you"> (you)</span>' : '') + '</td>'
      + '<td>' + fmt(chips) + '</td><td class="icm-hide-sm">' + chipPct.toFixed(1) + '%</td>'
      + '<td>₱' + fmt(equities[i]) + '</td><td class="icm-hide-sm">' + icmPct.toFixed(1) + '%</td>'
      + '<td class="' + cls + '">' + (diff > 0 ? '+' : '') + diff.toFixed(1) + '</td></tr>';
  });
  document.getElementById('icm-tbody').innerHTML = rows;
  document.getElementById('icm-note').textContent = 'ICM value is what each stack is worth in prize money right now. Chip leaders are worth less than their chip share and short stacks more — the gap widens as you near a pay jump. Total prizes for these places: ₱' + fmt(prizeTotal) + '.';

  var callEl = document.getElementById('icm-call');
  if (hero === villain) {
    callEl.style.display = 'none';
  } else if (!(stacks[hero] > 0) || !(stacks[villain] > 0)) {
    callEl.style.display = 'none';
  } else {
    var dead = parseFloat(document.getElementById('icm-dead').value) || 0;
    var a = PokerHQICM.callAnalysis({ stacks: stacks, payouts: payouts, hero: hero, villain: villain, dead: dead });
    var need = a.required * 100, chip = a.chipBreakeven * 100, tax = a.tax * 100;
    var cls2 = tax >= 8 ? 'shove' : (tax >= 3 ? 'amber' : 'blue');
    callEl.className = 'calc-rec-banner ' + cls2;
    callEl.style.display = '';
    callEl.innerHTML =
      '<div class="rec-label">Player ' + (hero + 1) + ' calling Player ' + (villain + 1) + '\'s all-in for ' + fmt(a.eff) + ' chips</div>'
      + '<div class="rec-action">NEED ' + need.toFixed(1) + '% EQUITY</div>'
      + '<div class="rec-detail">Chip EV alone says ' + chip.toFixed(1) + '%; ICM adds ' + (tax >= 0 ? tax.toFixed(1) : '0.0') + ' points.'
      + ' Fold keeps ₱' + fmt(a.eFold) + ' · win ₱' + fmt(a.eWin) + ' · lose ₱' + fmt(a.eLose) + '.</div>';
  }
  show('ok');
}

// Minimum logged (paid) sessions before trusting a measured mean/variance —
// fewer than this and a single big score or bad run swings the estimate wildly.
var CALC_RISK_MIN_SESSIONS = 10;
var CALC_RISK_SMALL_SAMPLE_CEILING = 20;

function calcRiskAutoFillFromSessions() {
  var noteEl = document.getElementById('calc-risk-autofill-note');
  var list = (window.sessions || []).filter(function(s) { return (s.total || 0) > 0; });

  if (!noteEl) return;
  noteEl.style.display = '';

  if (list.length < CALC_RISK_MIN_SESSIONS) {
    noteEl.style.color = 'var(--red)';
    noteEl.textContent = 'Need at least ' + CALC_RISK_MIN_SESSIONS + ' logged sessions with a buy-in to compute this reliably — you have ' + list.length + '.';
    return;
  }

  var totalInvested = 0, totalReturned = 0;
  var ratios = [];
  list.forEach(function(s) {
    var buyin = s.total || 0;
    totalInvested += buyin;
    totalReturned += (s.prize || 0);
    ratios.push((s.pnl || 0) / buyin);
  });

  var avgBuyin = totalInvested / list.length;
  var roiPct = totalInvested > 0 ? ((totalReturned - totalInvested) / totalInvested) * 100 : 0;

  var meanRatio = ratios.reduce(function(a, b) { return a + b; }, 0) / ratios.length;
  var variance = ratios.reduce(function(sum, r) { return sum + Math.pow(r - meanRatio, 2); }, 0) / ratios.length;
  // Floor sigma — a near-zero measured variance (e.g. a short run of near-identical
  // results) would otherwise make bust risk look implausibly low.
  var sigma = Math.max(0.3, Math.sqrt(variance));

  _calcRiskVarianceMap.measured = { sigma: sigma, label: 'My results (σ=' + sigma.toFixed(2) + ')' };

  var select = document.getElementById('calc-risk-variance');
  if (select) {
    var opt = select.querySelector('option[value="measured"]');
    if (!opt) {
      opt = document.createElement('option');
      opt.value = 'measured';
      select.appendChild(opt);
    }
    opt.textContent = _calcRiskVarianceMap.measured.label;
    select.value = 'measured';
  }

  var bankrollEl = document.getElementById('calc-risk-bankroll');
  if (bankrollEl && window.bankroll && window.bankroll.amount) bankrollEl.value = Math.round(window.bankroll.amount);
  document.getElementById('calc-risk-buyin').value = Math.round(avgBuyin);
  document.getElementById('calc-risk-roi').value = roiPct.toFixed(1);

  var smallSampleNote = list.length < CALC_RISK_SMALL_SAMPLE_CEILING
    ? ' Small sample — treat this as a rough read, not a settled number.'
    : '';
  noteEl.style.color = list.length < CALC_RISK_SMALL_SAMPLE_CEILING ? 'var(--gold)' : 'rgba(255,255,255,.4)';
  noteEl.textContent = 'Computed from ' + list.length + ' sessions: avg buy-in ₱' + Math.round(avgBuyin).toLocaleString()
    + ', ROI ' + roiPct.toFixed(1) + '%, measured variance σ=' + sigma.toFixed(2) + '.' + smallSampleNote;

  calcRiskEngine();
}

var _calcRiskVarianceMap = {
  low: { sigma: 1.1, label: 'Low variance field' },
  standard: { sigma: 1.5, label: 'Standard tournament variance' },
  high: { sigma: 1.9, label: 'High variance / tough field' }
};

function calcRiskSyncDefaults() {
  var brInput = document.getElementById('calc-risk-bankroll');
  if (!brInput || brInput.value) return;
  var currentBankroll = window.bankroll && window.bankroll.amount ? window.bankroll.amount : 0;
  if (currentBankroll > 0) brInput.value = Math.round(currentBankroll);
}

function calcRiskClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calcRiskCurrency(amount) {
  return '₱' + Math.round(amount).toLocaleString();
}

function calcRiskBuyins(targetRisk, roiDec, sigma) {
  if (roiDec <= 0) return null;
  return Math.max(1, Math.ceil((Math.log(1 / targetRisk) * sigma * sigma) / (2 * roiDec)));
}

function calcRiskEngine() {
  calcRiskSyncDefaults();

  var bankrollAmt = parseFloat(document.getElementById('calc-risk-bankroll').value) || 0;
  var avgBuyin = parseFloat(document.getElementById('calc-risk-buyin').value) || 0;
  var roiPct = parseFloat(document.getElementById('calc-risk-roi').value);
  var varianceKey = document.getElementById('calc-risk-variance').value || 'standard';
  var variance = _calcRiskVarianceMap[varianceKey] || _calcRiskVarianceMap.standard;
  var emptyEl = document.getElementById('calc-risk-empty');
  var resultsEl = document.getElementById('calc-risk-results');

  if (!bankrollAmt || !avgBuyin || isNaN(roiPct)) {
    emptyEl.style.display = '';
    resultsEl.style.display = 'none';
    return;
  }

  emptyEl.style.display = 'none';
  resultsEl.style.display = '';

  var bankrollBuyins = bankrollAmt / avgBuyin;
  var roiDec = roiPct / 100;
  var sigma = variance.sigma;
  var ruinRisk = roiDec <= 0
    ? 0.999
    : Math.exp((-2 * roiDec * bankrollBuyins) / (sigma * sigma));
  ruinRisk = calcRiskClamp(ruinRisk, 0.001, 0.999);

  var aggressiveBuyins = calcRiskBuyins(0.15, roiDec, sigma);
  var balancedBuyins = calcRiskBuyins(0.05, roiDec, sigma);
  var conservativeBuyins = calcRiskBuyins(0.01, roiDec, sigma);

  if (roiDec <= 0) {
    aggressiveBuyins = varianceKey === 'high' ? 140 : varianceKey === 'low' ? 90 : 115;
    balancedBuyins = aggressiveBuyins + 35;
    conservativeBuyins = balancedBuyins + 50;
  }

  var shotBanner = document.getElementById('risk-shot-banner');
  var shotClass = 'normal';
  var shotTitle = 'Bankroll fits the stake';
  var shotDetail = 'You have enough buy-ins for this average stake. A higher-variance field still deserves discipline.';

  if (bankrollBuyins < aggressiveBuyins) {
    shotClass = 'shove';
    shotTitle = 'Shot-taking warning';
    shotDetail = 'Current bankroll depth is below even the aggressive band. Move down or reduce volume at this buy-in.';
  } else if (bankrollBuyins < balancedBuyins) {
    shotClass = 'amber';
    shotTitle = 'Thin for regular volume';
    shotDetail = 'This stake is playable only as a measured shot. Treat it as occasional exposure, not your default schedule.';
  } else if (bankrollBuyins < conservativeBuyins) {
    shotClass = 'protect';
    shotTitle = 'Playable with pressure';
    shotDetail = 'You are inside the balanced band. Fine for regular play, but protect against long tournament downswings.';
  }

  document.getElementById('risk-bust-val').textContent = (ruinRisk * 100).toFixed(1) + '%';
  document.getElementById('risk-depth-val').textContent = bankrollBuyins.toFixed(1) + ' buy-ins available at this ABI';

  var recommendedLow = balancedBuyins;
  var recommendedHigh = conservativeBuyins;
  document.getElementById('risk-band-val').textContent = recommendedLow + '–' + recommendedHigh + ' buy-ins';
  document.getElementById('risk-band-sub').textContent = calcRiskCurrency(recommendedLow * avgBuyin) + ' to ' + calcRiskCurrency(recommendedHigh * avgBuyin) + ' at ' + variance.label;

  document.getElementById('risk-aggressive-buyins').textContent = aggressiveBuyins + '+ buy-ins';
  document.getElementById('risk-aggressive-bankroll').textContent = calcRiskCurrency(aggressiveBuyins * avgBuyin);
  document.getElementById('risk-balanced-buyins').textContent = balancedBuyins + '+ buy-ins';
  document.getElementById('risk-balanced-bankroll').textContent = calcRiskCurrency(balancedBuyins * avgBuyin);
  document.getElementById('risk-conservative-buyins').textContent = conservativeBuyins + '+ buy-ins';
  document.getElementById('risk-conservative-bankroll').textContent = calcRiskCurrency(conservativeBuyins * avgBuyin);

  shotBanner.className = 'calc-rec-banner ' + shotClass;
  shotBanner.innerHTML =
    '<div class="rec-label">Shot-taking read</div>' +
    '<div class="rec-action">' + shotTitle + '</div>' +
    '<div class="rec-detail">' + shotDetail + '</div>';
}
