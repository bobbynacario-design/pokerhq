function stakingRound2(value) {
  return Math.round(value * 100) / 100;
}

function stakingCurrency(amount) {
  return '₱' + Math.round(amount).toLocaleString();
}

function collectSessionStakingData() {
  var packageName = '';
  var playerSharePct = '';
  var markup = '';
  var packageEl = document.getElementById('s-package');
  var shareEl = document.getElementById('s-player-share');
  var markupEl = document.getElementById('s-markup');
  if (packageEl) packageName = (packageEl.value || '').trim();
  if (shareEl) playerSharePct = shareEl.value;
  if (markupEl) markup = markupEl.value;

  var data = {};
  if (packageName) data.packageName = packageName;

  var shareNum = parseFloat(playerSharePct);
  if (!isNaN(shareNum)) {
    shareNum = Math.max(0, Math.min(100, shareNum));
    data.playerSharePct = stakingRound2(shareNum);
  }

  var markupNum = parseFloat(markup);
  if (!isNaN(markupNum) && markupNum > 0) {
    data.markup = stakingRound2(markupNum);
  }

  return data;
}

function getSessionStakingData(session) {
  if (!session) return null;
  var packageName = (session.packageName || '').trim();
  var totalBuyIn = parseFloat(session.total);
  if (!totalBuyIn) totalBuyIn = (parseFloat(session.buyin) || 0) + (parseFloat(session.rebuy) || 0);

  var rawPlayerShare = parseFloat(session.playerSharePct);
  var rawMarkup = parseFloat(session.markup);
  var hasStaking = packageName || !isNaN(rawPlayerShare) || !isNaN(rawMarkup);
  if (!hasStaking) return null;

  var playerSharePct = isNaN(rawPlayerShare) ? 100 : Math.max(0, Math.min(100, rawPlayerShare));
  var backerSharePct = Math.max(0, 100 - playerSharePct);
  var markup = isNaN(rawMarkup) || rawMarkup <= 0 ? 1 : rawMarkup;
  var prize = parseFloat(session.prize) || 0;
  var packageValue = stakingRound2(totalBuyIn * markup);
  var backerCost = stakingRound2(packageValue * (backerSharePct / 100));
  var playerCost = stakingRound2(totalBuyIn - backerCost);
  var backerReturn = stakingRound2(prize * (backerSharePct / 100));
  var playerReturn = stakingRound2((prize * (playerSharePct / 100)) + backerCost);
  var backerNet = stakingRound2(backerReturn - backerCost);
  var playerNet = stakingRound2(playerReturn - totalBuyIn);

  return {
    packageName: packageName,
    totalBuyIn: stakingRound2(totalBuyIn),
    playerSharePct: stakingRound2(playerSharePct),
    backerSharePct: stakingRound2(backerSharePct),
    markup: stakingRound2(markup),
    packageValue: packageValue,
    backerCost: backerCost,
    playerCost: playerCost,
    backerReturn: backerReturn,
    playerReturn: playerReturn,
    backerNet: backerNet,
    playerNet: playerNet
  };
}

function renderStakingInputSummary() {
  var tipEl = document.getElementById('staking-tip');
  if (!tipEl) return;

  var sessionStub = {
    total: (parseFloat((document.getElementById('s-buyin') || {}).value) || 0) + (parseFloat((document.getElementById('s-rebuy') || {}).value) || 0),
    prize: parseFloat((document.getElementById('s-prize') || {}).value) || 0
  };
  var formData = collectSessionStakingData();
  Object.keys(formData).forEach(function(key) {
    sessionStub[key] = formData[key];
  });

  var staking = getSessionStakingData(sessionStub);
  if (!staking) {
    tipEl.textContent = 'Optional: track sold action and package economics without changing your core session log.';
    return;
  }

  tipEl.textContent =
    'Player ' + staking.playerSharePct.toFixed(0) + '% | Backer ' + staking.backerSharePct.toFixed(0) +
    '% | Package value ' + stakingCurrency(staking.packageValue) +
    (staking.packageName ? ' | ' + staking.packageName : '');
}

function getStakingSessions() {
  if (!window.sessions || !window.sessions.length) return [];
  return window.sessions.filter(function(s) { return !!getSessionStakingData(s); });
}

function getStakingPackageRows() {
  var grouped = {};
  getStakingSessions().forEach(function(session) {
    var staking = getSessionStakingData(session);
    if (!staking) return;
    var key = staking.packageName || 'Single Event';
    if (!grouped[key]) {
      grouped[key] = {
        packageLabel: key,
        sessionCount: 0,
        totalBuyIn: 0,
        packageValue: 0,
        playerCost: 0,
        backerCost: 0,
        playerNet: 0,
        backerNet: 0,
        prizes: 0
      };
    }
    grouped[key].sessionCount++;
    grouped[key].totalBuyIn += staking.totalBuyIn;
    grouped[key].packageValue += staking.packageValue;
    grouped[key].playerCost += staking.playerCost;
    grouped[key].backerCost += staking.backerCost;
    grouped[key].playerNet += staking.playerNet;
    grouped[key].backerNet += staking.backerNet;
    grouped[key].prizes += parseFloat(session.prize) || 0;
  });

  return Object.keys(grouped).map(function(key) {
    var row = grouped[key];
    row.totalBuyIn = stakingRound2(row.totalBuyIn);
    row.packageValue = stakingRound2(row.packageValue);
    row.playerCost = stakingRound2(row.playerCost);
    row.backerCost = stakingRound2(row.backerCost);
    row.playerNet = stakingRound2(row.playerNet);
    row.backerNet = stakingRound2(row.backerNet);
    row.prizes = stakingRound2(row.prizes);
    return row;
  }).sort(function(a, b) {
    if (b.sessionCount !== a.sessionCount) return b.sessionCount - a.sessionCount;
    return a.packageLabel.localeCompare(b.packageLabel);
  });
}

function renderStakingSummary() {
  var wrap = document.getElementById('staking-summary-wrap');
  if (!wrap) return;
  var packageRows = getStakingPackageRows();
  if (!packageRows.length) {
    wrap.innerHTML = '<div class="tip">Log player share or a package name above to track staking results without changing your session flow.</div>';
    return;
  }

  var sessionCount = getStakingSessions().length;
  var totalPackageValue = packageRows.reduce(function(sum, row) { return sum + row.packageValue; }, 0);
  var totalPlayerNet = packageRows.reduce(function(sum, row) { return sum + row.playerNet; }, 0);
  var totalBackerNet = packageRows.reduce(function(sum, row) { return sum + row.backerNet; }, 0);

  var html = '<div class="staking-grid">';
  html += '<div class="staking-card"><div class="staking-card-label">Tracked Events</div><div class="staking-card-val">' + sessionCount + '</div><div class="staking-card-sub">' + packageRows.length + ' package group' + (packageRows.length !== 1 ? 's' : '') + '</div></div>';
  html += '<div class="staking-card"><div class="staking-card-label">Package Value</div><div class="staking-card-val">' + stakingCurrency(totalPackageValue) + '</div><div class="staking-card-sub">Markup-adjusted total</div></div>';
  html += '<div class="staking-card"><div class="staking-card-label">Player Net</div><div class="staking-card-val ' + (totalPlayerNet >= 0 ? 'staking-up' : 'staking-down') + '">' + fmtCur(totalPlayerNet) + '</div><div class="staking-card-sub">After sold action</div></div>';
  html += '<div class="staking-card"><div class="staking-card-label">Backer Net</div><div class="staking-card-val ' + (totalBackerNet >= 0 ? 'staking-up' : 'staking-down') + '">' + fmtCur(totalBackerNet) + '</div><div class="staking-card-sub">Across tracked pieces</div></div>';
  html += '</div>';

  html += '<div class="staking-table-wrap"><table class="tbl"><thead><tr><th>Package</th><th>Events</th><th>Total Buy-in</th><th>Package Value</th><th>Player Net</th><th>Backer Net</th></tr></thead><tbody>';
  packageRows.forEach(function(row) {
    var playerCls = row.playerNet > 0 ? 'profit-pos' : row.playerNet < 0 ? 'profit-neg' : 'profit-zero';
    var backerCls = row.backerNet > 0 ? 'profit-pos' : row.backerNet < 0 ? 'profit-neg' : 'profit-zero';
    html += '<tr><td>' + row.packageLabel + '</td><td>' + row.sessionCount + '</td><td>' + stakingCurrency(row.totalBuyIn) + '</td><td>' + stakingCurrency(row.packageValue) + '</td><td class="' + playerCls + '">' + fmtCur(row.playerNet) + '</td><td class="' + backerCls + '">' + fmtCur(row.backerNet) + '</td></tr>';
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

function exportStakingCSV() {
  var stakingSessions = getStakingSessions();
  if (!stakingSessions.length) {
    alert('No staking data to export yet.');
    return;
  }

  var packageRows = getStakingPackageRows();
  var lines = [];
  lines.push('Package,Events,Total Buy-in,Package Value,Player Cost,Backer Cost,Player Net,Backer Net,Prizes');
  packageRows.forEach(function(row) {
    lines.push([
      '"' + row.packageLabel.replace(/"/g, "''") + '"',
      row.sessionCount,
      row.totalBuyIn,
      row.packageValue,
      row.playerCost,
      row.backerCost,
      row.playerNet,
      row.backerNet,
      row.prizes
    ].join(','));
  });

  lines.push('');
  lines.push('Date,Tournament,Package,Total Buy-in,Player Share %,Backer Share %,Markup,Package Value,Player Net,Backer Net');
  stakingSessions.forEach(function(session) {
    var staking = getSessionStakingData(session);
    lines.push([
      session.date || '',
      '"' + (session.name || '').replace(/"/g, "''") + '"',
      '"' + (staking.packageName || 'Single Event').replace(/"/g, "''") + '"',
      staking.totalBuyIn,
      staking.playerSharePct,
      staking.backerSharePct,
      staking.markup,
      staking.packageValue,
      staking.playerNet,
      staking.backerNet
    ].join(','));
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'PokerHQ_Staking_' + new Date().toISOString().split('T')[0] + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
