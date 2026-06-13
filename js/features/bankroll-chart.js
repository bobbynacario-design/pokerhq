var BUYIN_BREAKDOWN_RANGES = [
  { label: '₱0 – ₱2,999', min: 0, max: 2999 },
  { label: '₱3,000 – ₱5,999', min: 3000, max: 5999 },
  { label: '₱6,000 – ₱9,999', min: 6000, max: 9999 },
  { label: '₱10,000 – ₱15,000', min: 10000, max: 15000 },
  { label: '₱15,000+', min: 15001, max: Infinity }
];

function renderDashboardExtras() {
  renderVarianceWidget();
  var list = window.sessions || [];

  // Hourly rate stat card — only sessions with logged hours count
  var hourlyEl = document.getElementById('dash-hourly');
  var hourlySubEl = document.getElementById('dash-hourly-sub');
  if (hourlyEl) {
    var timed = list.filter(function(s) { return (s.hours || 0) > 0; });
    var hoursTotal = timed.reduce(function(sum, s) { return sum + s.hours; }, 0);
    var pnlTimed = timed.reduce(function(sum, s) { return sum + (s.pnl || 0); }, 0);
    if (hoursTotal > 0) {
      var rate = pnlTimed / hoursTotal;
      hourlyEl.textContent = fmtCur(rate) + '/hr';
      hourlyEl.className = 'stat-val ' + (rate > 0 ? 'stat-up' : rate < 0 ? 'stat-down' : '');
      if (hourlySubEl) hourlySubEl.textContent = (Math.round(hoursTotal * 10) / 10) + 'h across ' + timed.length + ' session' + (timed.length !== 1 ? 's' : '');
    } else {
      hourlyEl.textContent = '—';
      hourlyEl.className = 'stat-val';
      if (hourlySubEl) hourlySubEl.textContent = 'Log hours to see ₱/hr';
    }
  }

  // Performance by buy-in level
  var wrap = document.getElementById('buyin-breakdown');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = '<div style="color:rgba(255,255,255,.2);font-family:var(--mono);font-size:11px;width:100%;text-align:center;padding:1.6rem 0;background:var(--bg2);border:1px solid var(--rim);border-radius:12px">Log sessions to compare buy-in levels</div>';
    return;
  }
  var rows = BUYIN_BREAKDOWN_RANGES.map(function(range) {
    var inRange = list.filter(function(s) { return (s.total || 0) >= range.min && (s.total || 0) <= range.max; });
    if (!inRange.length) return null;
    var invested = 0, returned = 0, hours = 0, itm = 0;
    inRange.forEach(function(s) {
      invested += s.total || 0;
      returned += s.prize || 0;
      hours += s.hours || 0;
      if (s.result === 'itm' || s.result === 'final') itm++;
    });
    var pnl = returned - invested;
    return {
      label: range.label,
      count: inRange.length,
      itmPct: Math.round((itm / inRange.length) * 100),
      invested: invested,
      pnl: pnl,
      roi: invested > 0 ? Math.round((pnl / invested) * 1000) / 10 : 0,
      perHour: hours > 0 ? pnl / hours : null
    };
  }).filter(Boolean);

  var html = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Buy-in level</th><th>Sessions</th><th>ITM</th><th>Invested</th><th>P&amp;L</th><th>ROI</th><th>₱/hr</th></tr></thead><tbody>';
  rows.forEach(function(r) {
    var cls = r.pnl > 0 ? 'profit-pos' : r.pnl < 0 ? 'profit-neg' : 'profit-zero';
    html += '<tr><td>' + r.label + '</td><td>' + r.count + '</td><td>' + r.itmPct + '%</td><td>₱' + fmt(r.invested) + '</td><td class="' + cls + '">' + fmtCur(r.pnl) + '</td><td class="' + cls + '">' + r.roi + '%</td><td>' + (r.perHour === null ? '—' : fmtCur(Math.round(r.perHour)) + '/hr') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

function renderVarianceWidget() {
  var wrap = document.getElementById('variance-widget');
  if (!wrap) return;
  var list = window.sessions || [];
  var points = buildBankrollTimelinePoints();
  if (list.length < 2 || points.length < 2) { wrap.innerHTML = ''; return; }

  // Peak, current drawdown, and worst-ever drawdown from the bankroll timeline
  var peak = -Infinity, runPeak = -Infinity, worstDD = 0;
  points.forEach(function(p) {
    if (p.balance > peak) peak = p.balance;
    if (p.balance > runPeak) runPeak = p.balance;
    var dd = runPeak - p.balance;
    if (dd > worstDD) worstDD = dd;
  });
  var current = points[points.length - 1].balance;
  var drawdown = Math.max(0, peak - current);
  var ddPct = peak > 0 ? Math.round((drawdown / peak) * 1000) / 10 : 0;

  // Stake yardstick: average buy-in across all sessions
  var totalIn = 0, totalOut = 0;
  list.forEach(function(s) { totalIn += s.total || 0; totalOut += s.prize || 0; });
  var avgBuyin = list.length ? totalIn / list.length : 0;
  var ddBuyins = avgBuyin > 0 ? Math.round((drawdown / avgBuyin) * 10) / 10 : 0;
  var worstBuyins = avgBuyin > 0 ? Math.round((worstDD / avgBuyin) * 10) / 10 : 0;
  var runwayBuyins = avgBuyin > 0 ? Math.floor(current / avgBuyin) : 0;

  // Current streak (sessions array is newest-first)
  var streak = 0, streakDir = 0;
  for (var i = 0; i < list.length; i++) {
    var pnl = list[i].pnl || 0;
    if (!pnl) break;
    var dir = pnl > 0 ? 1 : -1;
    if (!streakDir) streakDir = dir;
    if (dir !== streakDir) break;
    streak++;
  }

  // Risk of ruin — same model as the Calc page risk engine, fed with live ROI.
  var roiDec = totalIn > 0 ? (totalOut - totalIn) / totalIn : 0;
  var sigma = (typeof _calcRiskVarianceMap !== 'undefined' && _calcRiskVarianceMap.standard) ? _calcRiskVarianceMap.standard.sigma : 1.5;
  var ruinText = '—', ruinSub = 'Needs a winning sample';
  if (list.length >= 10 && roiDec > 0 && runwayBuyins > 0) {
    var ruin = Math.exp((-2 * roiDec * runwayBuyins) / (sigma * sigma));
    ruin = Math.min(0.999, Math.max(0.001, ruin));
    ruinText = ruin < 0.01 ? '<1%' : Math.round(ruin * 100) + '%';
    ruinSub = 'If current ROI holds';
  } else if (roiDec <= 0) {
    ruinSub = 'ROI is negative — model needs a winning sample';
  } else {
    ruinSub = 'Needs 10+ sessions';
  }

  // Status read
  var cls, title, detail;
  if (drawdown < 1) {
    cls = 'normal';
    title = 'At your bankroll peak';
    detail = 'No drawdown right now — keep the same game selection and discipline that got you here.';
  } else if (ddBuyins < 5) {
    cls = 'blue';
    title = 'Normal variance';
    detail = fmtCur(-drawdown) + ' off peak is ' + ddBuyins + ' average buy-ins — well inside normal MTT swing. No adjustment needed.';
  } else if (ddBuyins < 10) {
    cls = 'amber';
    title = 'Moderate downswing';
    detail = ddBuyins + ' buy-ins below peak. Stick to the BRM rule, lean on qualifiers over direct entries, and protect the mental game.';
  } else {
    cls = 'shove';
    title = 'Deep downswing';
    detail = ddBuyins + ' buy-ins below peak. Strong case to drop a stake level and rebuild through satellites until the curve turns.';
  }
  if (runwayBuyins > 0 && runwayBuyins < 10 && cls !== 'shove') {
    cls = 'amber';
    detail += ' Note: only ' + runwayBuyins + ' average buy-ins of runway left — shot selection matters more than usual.';
  }

  var streakTile = streak
    ? '<div class="variance-tile-value" style="color:' + (streakDir > 0 ? 'var(--green)' : 'var(--red)') + '">' + streak + ' ' + (streakDir > 0 ? 'won' : 'lost') + '</div><div class="variance-tile-sub">Consecutive sessions</div>'
    : '<div class="variance-tile-value">—</div><div class="variance-tile-sub">No current streak</div>';

  var html = '<div class="chart-wrap">';
  html += '<div class="chart-title">Variance &amp; Downswing</div>';
  html += '<div class="variance-grid">';
  html += '<div class="variance-tile"><div class="variance-tile-label">Peak bankroll</div><div class="variance-tile-value">₱' + fmt(peak) + '</div><div class="variance-tile-sub">All-time high</div></div>';
  html += '<div class="variance-tile"><div class="variance-tile-label">Off peak</div><div class="variance-tile-value" style="color:' + (drawdown < 1 ? 'var(--green)' : 'var(--red)') + '">' + (drawdown < 1 ? 'At peak' : fmtCur(-drawdown)) + '</div><div class="variance-tile-sub">' + (drawdown < 1 ? 'Drawdown 0%' : ddPct + '% · ' + ddBuyins + ' avg buy-ins') + '</div></div>';
  html += '<div class="variance-tile"><div class="variance-tile-label">Worst downswing</div><div class="variance-tile-value">' + (worstDD > 0 ? fmtCur(-worstDD) : '—') + '</div><div class="variance-tile-sub">' + (worstDD > 0 ? worstBuyins + ' avg buy-ins, survived' : 'None recorded') + '</div></div>';
  html += '<div class="variance-tile"><div class="variance-tile-label">Streak</div>' + streakTile + '</div>';
  html += '<div class="variance-tile"><div class="variance-tile-label">Runway</div><div class="variance-tile-value">' + (runwayBuyins || '—') + (runwayBuyins ? '×' : '') + '</div><div class="variance-tile-sub">Avg buy-ins at ₱' + fmt(avgBuyin) + '</div></div>';
  html += '<div class="variance-tile"><div class="variance-tile-label">Risk of ruin</div><div class="variance-tile-value">' + ruinText + '</div><div class="variance-tile-sub">' + ruinSub + '</div></div>';
  html += '</div>';
  html += '<div class="calc-rec-banner ' + cls + '" style="margin-top:1rem"><div class="rec-label">Variance read</div><div class="rec-action">' + title + '</div><div class="rec-detail">' + detail + '</div></div>';
  html += '</div>';
  wrap.innerHTML = html;
}

function buildBankrollTimelineEvents() {
  var events = [];
  (window.sessions || []).forEach(function(s) {
    var d = new Date((s.date || '') + 'T00:00:00');
    if (isNaN(d.getTime())) return;
    events.push({ time: d.getTime(), delta: s.pnl || 0, label: s.name || 'Session', id: s.id || 0 });
  });
  if (typeof getWalletTransactionDeltas === 'function') {
    (window.walletLedger || []).forEach(function(entry) {
      if (!entry || typeof entry !== 'object') return;
      var deltas = getWalletTransactionDeltas(entry.type, entry.amount);
      if (!deltas || !deltas.bankrollDelta) return;
      var d = new Date((entry.date || '') + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      var label = typeof formatWalletTypeLabel === 'function' ? formatWalletTypeLabel(entry.type) : 'Treasury';
      events.push({ time: d.getTime(), delta: deltas.bankrollDelta, label: label, id: entry.id || 0 });
    });
  }
  events.sort(function(a, b) { return a.time - b.time || a.id - b.id; });
  return events;
}

function buildBankrollTimelinePoints() {
  var events = buildBankrollTimelineEvents();
  if (!events.length) return [];
  // Walk backwards from the live balance so the last point always matches the app.
  var running = (window.bankroll && window.bankroll.amount) || 0;
  var points = new Array(events.length);
  for (var i = events.length - 1; i >= 0; i--) {
    points[i] = { time: events[i].time, balance: running, label: events[i].label, delta: events[i].delta };
    running -= events[i].delta;
  }
  var dayMs = 24 * 60 * 60 * 1000;
  points.unshift({ time: events[0].time - dayMs, balance: running, label: 'Starting bankroll', delta: 0 });
  return points;
}

function bankrollChartNiceStep(rough) {
  if (rough <= 0) return 1;
  var mag = Math.pow(10, Math.floor(Math.log(rough) / Math.LN10));
  var candidates = [1, 2, 2.5, 5, 10];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] * mag >= rough) return candidates[i] * mag;
  }
  return 10 * mag;
}

function bankrollChartDateLabel(time) {
  return new Date(time).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function renderBankrollChart() {
  var wrap = document.getElementById('bankroll-chart');
  if (!wrap) return;
  var points = buildBankrollTimelinePoints();
  if (points.length < 2) {
    wrap.innerHTML = '<div style="color:rgba(255,255,255,.2);font-family:var(--mono);font-size:11px;width:100%;text-align:center;padding:2rem 0">Log sessions or treasury transfers to see your bankroll curve</div>';
    return;
  }

  var W = 820, H = 280, padL = 70, padR = 20, padT = 16, padB = 34;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  var minT = points[0].time, maxT = points[points.length - 1].time;
  var spanT = Math.max(1, maxT - minT);
  var minB = Infinity, maxB = -Infinity;
  points.forEach(function(p) {
    if (p.balance < minB) minB = p.balance;
    if (p.balance > maxB) maxB = p.balance;
  });
  var yStep = bankrollChartNiceStep((maxB - minB || Math.max(1, maxB)) / 4);
  var yMin = Math.floor(minB / yStep) * yStep;
  var yMax = Math.ceil(maxB / yStep) * yStep;
  if (yMin === yMax) yMax = yMin + yStep;

  function px(t) { return padL + ((t - minT) / spanT) * plotW; }
  function py(b) { return padT + (1 - (b - yMin) / (yMax - yMin)) * plotH; }

  var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bankroll over time">';

  for (var b = yMin; b <= yMax + 0.001; b += yStep) {
    var gy = py(b);
    svg += '<line class="bk-grid-line" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>';
    svg += '<text class="bk-axis-label" x="' + (padL - 8) + '" y="' + (gy + 3) + '" text-anchor="end">' + (b < 0 ? fmtCur(b) : '₱' + fmt(b)) + '</text>';
  }
  var tickCount = Math.min(5, points.length);
  for (var ti = 0; ti < tickCount; ti++) {
    var tt = minT + (spanT * ti) / (tickCount - 1 || 1);
    svg += '<text class="bk-axis-label" x="' + px(tt) + '" y="' + (H - 12) + '" text-anchor="middle">' + bankrollChartDateLabel(tt) + '</text>';
  }

  var lineCoords = points.map(function(p) { return px(p.time).toFixed(1) + ',' + py(p.balance).toFixed(1); });
  var baseY = py(yMin);
  svg += '<path class="bk-area" d="M' + px(points[0].time).toFixed(1) + ',' + baseY.toFixed(1) + ' L' + lineCoords.join(' L') + ' L' + px(points[points.length - 1].time).toFixed(1) + ',' + baseY.toFixed(1) + ' Z"/>';
  svg += '<polyline class="bk-line" points="' + lineCoords.join(' ') + '"/>';
  svg += '<line class="bk-guide" id="bk-guide" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + plotH) + '"/>';
  points.forEach(function(p, idx) {
    var current = idx === points.length - 1;
    svg += '<circle class="bk-dot' + (current ? ' bk-dot-current' : '') + '" data-idx="' + idx + '" cx="' + px(p.time).toFixed(1) + '" cy="' + py(p.balance).toFixed(1) + '" r="' + (current ? 5 : 3.5) + '"/>';
  });
  svg += '</svg>';

  wrap.innerHTML = svg + '<div class="bk-tooltip" id="bk-tooltip"></div>';

  var svgEl = wrap.querySelector('svg');
  var tooltip = document.getElementById('bk-tooltip');
  var guide = document.getElementById('bk-guide');

  function showPoint(clientX) {
    var rect = svgEl.getBoundingClientRect();
    var vx = ((clientX - rect.left) / rect.width) * W;
    var best = 0, bestDist = Infinity;
    points.forEach(function(p, idx) {
      var d = Math.abs(px(p.time) - vx);
      if (d < bestDist) { bestDist = d; best = idx; }
    });
    var p = points[best];
    var deltaHtml = p.delta
      ? '<div style="color:' + (p.delta >= 0 ? 'var(--green)' : 'var(--red)') + '">' + fmtCur(p.delta) + '</div>'
      : '';
    tooltip.innerHTML =
      '<div style="opacity:.55;margin-bottom:.2rem">' + bankrollChartDateLabel(p.time) + '</div>' +
      '<div style="margin-bottom:.2rem">' + esc(p.label) + '</div>' +
      deltaHtml +
      '<div style="margin-top:.25rem;font-size:12px;color:var(--gold)">₱' + fmt(p.balance) + '</div>';
    tooltip.style.display = 'block';
    var dotX = (px(p.time) / W) * rect.width;
    var dotY = (py(p.balance) / H) * rect.height;
    var tipW = tooltip.offsetWidth || 150;
    var left = dotX + 14;
    if (left + tipW > rect.width) left = dotX - tipW - 14;
    tooltip.style.left = Math.max(0, left) + 'px';
    tooltip.style.top = Math.max(0, dotY - 20) + 'px';
    guide.setAttribute('x1', px(p.time));
    guide.setAttribute('x2', px(p.time));
    guide.style.display = 'block';
  }

  function hidePoint() {
    tooltip.style.display = 'none';
    guide.style.display = 'none';
  }

  svgEl.addEventListener('mousemove', function(e) { showPoint(e.clientX); });
  svgEl.addEventListener('mouseleave', hidePoint);
  svgEl.addEventListener('touchstart', function(e) {
    if (e.touches && e.touches.length) showPoint(e.touches[0].clientX);
  }, { passive: true });
}
