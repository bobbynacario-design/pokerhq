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

  var bbDepth          = stack / bb;
  var mRatio           = stack / (bb * 2);
  var playersFromMoney = Math.max(0, players - paid);
  var nearBubble       = playersFromMoney <= 10;
  var pctPaid          = (paid / players * 100).toFixed(0);

  document.getElementById('adv-bb-val').textContent  = bbDepth.toFixed(1)+' BB';
  document.getElementById('adv-m-val').textContent   = 'M-ratio: '+mRatio.toFixed(1)+'x';

  var bubbleTxt = playersFromMoney === 0
    ? 'In the money ✓'
    : playersFromMoney+' spot'+(playersFromMoney!==1?'s':'')+' from the money';
  document.getElementById('adv-bubble-val').textContent = bubbleTxt;
  document.getElementById('adv-pct-paid').textContent   = pctPaid+'% of field paid';

  var rec, cls, detail;
  if (bbDepth <= 10) {
    rec = 'SHOVE ANY TWO'; cls = 'shove';
    detail = bbDepth.toFixed(1)+'BB — push/fold only. Get it in before the blinds cripple you.';
  } else if (bbDepth <= 15 && nearBubble) {
    rec = 'SHOVE TOP 40%'; cls = 'amber';
    detail = 'Short stack near the bubble — shove any pair, Ax, KJ+, QJ from any position.';
  } else if (bbDepth <= 20 && nearBubble) {
    rec = 'SHOVE TOP 25%'; cls = 'amber';
    detail = 'Bubble pressure — shove 66+, AJ+, KQ. Fold marginal hands and preserve your equity.';
  } else if (bbDepth <= 20) {
    rec = 'PLAY AGGRESSIVE'; cls = 'blue';
    detail = bbDepth.toFixed(1)+'BB — steal blinds, squeeze spots, and build a stack.';
  } else {
    rec = 'NORMAL PLAY'; cls = 'normal';
    detail = bbDepth.toFixed(1)+'BB — play your A-game. Open wide in position, use your stack leverage.';
  }
  var bannerEl = document.getElementById('adv-rec-banner');
  bannerEl.className = 'calc-rec-banner '+cls;
  bannerEl.innerHTML =
    '<div class="rec-label">Recommendation</div>'+
    '<div class="rec-action">'+rec+'</div>'+
    '<div class="rec-detail">'+detail+'</div>';

  var pfRows = [
    {id:'pfrow-10',  min:0,  max:10},
    {id:'pfrow-13',  min:10, max:13},
    {id:'pfrow-17',  min:13, max:17},
    {id:'pfrow-20',  min:17, max:20},
    {id:'pfrow-deep',min:20, max:Infinity}
  ];
  pfRows.forEach(function(r) {
    var el = document.getElementById(r.id);
    if (el) el.classList.toggle('active', bbDepth >= r.min && bbDepth < r.max);
  });
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
