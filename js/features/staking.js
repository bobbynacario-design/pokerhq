function stakingRound2(value) {
  return Math.round((value || 0) * 100) / 100;
}

function stakingCurrency(amount) {
  return '₱' + Math.round(amount).toLocaleString();
}

function stakingClamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parseBackerCount(value) {
  var count = parseInt(value, 10);
  return isNaN(count) || count < 0 ? 0 : count;
}

function normalizeStakingPackageName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getStakingPackageLabel(value) {
  return normalizeStakingPackageName(value) || 'Single Event';
}

function getStakingPackageGroupKey(value) {
  var label = getStakingPackageLabel(value);
  return label.toLowerCase();
}

function getStakingSessionSortValue(session) {
  if (!session) return 0;
  var parsed = Date.parse(session.date || '');
  if (!isNaN(parsed)) return parsed;
  var numericId = parseInt(session.id, 10);
  return isNaN(numericId) ? 0 : numericId;
}

function getLatestStakingPackageName() {
  if (_activeSessionDraft && _activeSessionDraft.packageName) {
    var draftPackage = normalizeStakingPackageName(_activeSessionDraft.packageName);
    if (draftPackage) return draftPackage;
  }
  if (!window.sessions || !window.sessions.length) return '';
  for (var i = 0; i < window.sessions.length; i++) {
    var packageName = normalizeStakingPackageName(window.sessions[i] && window.sessions[i].packageName);
    if (packageName) return packageName;
  }
  return '';
}

function syncStakingPackageDraft(packageName) {
  var nextPackageName = normalizeStakingPackageName(packageName);
  if (!_activeSessionDraft) return;
  if (nextPackageName) _activeSessionDraft.packageName = nextPackageName;
  else delete _activeSessionDraft.packageName;
  if (typeof persistActiveSessionDraft === 'function') persistActiveSessionDraft();
}

function normalizeStakingMarkup(value, options) {
  var strict = !!(options && options.strict);
  var rawText = value == null ? '' : String(value).trim();
  rawText = rawText.replace(/x$/i, '').trim();
  if (!rawText) {
    return { value: 1, raw: NaN, rawText: '', empty: true, valid: false, autoNormalized: false, reason: '' };
  }

  rawText = rawText.replace(/,/g, '');
  var raw = parseFloat(rawText);
  if (isNaN(raw) || raw <= 0) {
    return { value: 1, raw: raw, rawText: rawText, empty: false, valid: false, autoNormalized: false, reason: 'Markup must be a positive number.' };
  }

  var normalized = raw;
  var autoNormalized = false;
  if (rawText.indexOf('.') === -1) {
    if (raw >= 10 && raw <= 30) {
      normalized = raw / 10;
      autoNormalized = true;
    } else if (raw >= 100 && raw <= 300) {
      normalized = raw / 100;
      autoNormalized = true;
    }
  }

  normalized = stakingRound2(normalized);
  if (strict && normalized > 3) {
    return {
      value: 1,
      raw: raw,
      rawText: rawText,
      empty: false,
      valid: false,
      autoNormalized: autoNormalized,
      reason: 'Markup looks too high. Use 1.3 for 30% markup.'
    };
  }

  return {
    value: normalized,
    raw: raw,
    rawText: rawText,
    empty: false,
    valid: true,
    autoNormalized: autoNormalized,
    reason: autoNormalized ? ('Markup ' + rawText + ' was normalized to ' + normalized.toFixed(2) + 'x.') : ''
  };
}

function normalizeStoredBackers(backers) {
  if (!Array.isArray(backers)) return [];
  var normalized = [];
  backers.forEach(function(backer, index) {
    if (!backer) return;
    var share = parseFloat(backer.sharePct);
    if (isNaN(share)) share = parseFloat(backer.share);
    if (isNaN(share)) share = parseFloat(backer.pct);
    if (isNaN(share) || share <= 0) return;
    normalized.push({
      name: String(backer.name || ('Backer ' + (index + 1))).trim() || ('Backer ' + (index + 1)),
      sharePct: stakingRound2(stakingClamp(share, 0, 100))
    });
  });
  return normalized;
}

function parseBackerAllocationsText(text) {
  var lines = String(text || '').split(/[\r\n;,]+/);
  var backers = [];
  lines.forEach(function(line) {
    var cleaned = String(line || '').trim();
    if (!cleaned) return;
    cleaned = cleaned.replace(/%/g, '');
    var matches = cleaned.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || !matches.length) return;
    var token = matches[matches.length - 1];
    var share = parseFloat(token);
    if (isNaN(share) || share <= 0) return;
    var tokenIndex = cleaned.lastIndexOf(token);
    var name = tokenIndex >= 0 ? cleaned.slice(0, tokenIndex) : '';
    name = name.replace(/[\s,:-]+$/g, '').trim();
    backers.push({
      name: name || ('Backer ' + (backers.length + 1)),
      sharePct: stakingRound2(stakingClamp(share, 0, 100))
    });
  });
  return backers;
}

function buildEqualSplitBackers(count, totalSharePct, startIndex) {
  var safeCount = parseBackerCount(count);
  var totalShare = stakingRound2(Math.max(0, totalSharePct || 0));
  if (!safeCount || totalShare <= 0) return [];
  var offset = parseBackerCount(startIndex) || 1;
  var backers = [];
  var allocated = 0;
  for (var i = 0; i < safeCount; i++) {
    var share = i === safeCount - 1
      ? stakingRound2(Math.max(0, totalShare - allocated))
      : stakingRound2(totalShare / safeCount);
    allocated += share;
    backers.push({ name: 'Backer ' + (offset + i), sharePct: share });
  }
  return backers;
}

function normalizeResolvedBackers(backers) {
  var cleaned = [];
  var total = 0;
  backers.forEach(function(backer, index) {
    if (!backer) return;
    var share = stakingRound2(stakingClamp(parseFloat(backer.sharePct) || 0, 0, 100));
    if (share <= 0) return;
    cleaned.push({
      name: String(backer.name || ('Backer ' + (index + 1))).trim() || ('Backer ' + (index + 1)),
      sharePct: share
    });
    total += share;
  });

  total = stakingRound2(total);
  if (total > 100 && cleaned.length) {
    var factor = 100 / total;
    var scaled = [];
    var allocated = 0;
    cleaned.forEach(function(backer, index) {
      var share = index === cleaned.length - 1
        ? stakingRound2(Math.max(0, 100 - allocated))
        : stakingRound2(backer.sharePct * factor);
      allocated += share;
      scaled.push({ name: backer.name, sharePct: share });
    });
    return scaled;
  }

  return cleaned;
}

function resolveSessionBackers(session, aggregateBackerSharePct) {
  var backers = normalizeResolvedBackers(normalizeStoredBackers(session && session.backers));
  var backerCount = parseBackerCount(session && session.backerCount);
  if (backers.length > backerCount) backerCount = backers.length;

  var namedShare = stakingRound2(backers.reduce(function(sum, backer) {
    return sum + backer.sharePct;
  }, 0));
  var totalBackerSharePct = stakingRound2(stakingClamp(aggregateBackerSharePct || 0, 0, 100));

  if (backers.length && namedShare > totalBackerSharePct) {
    totalBackerSharePct = namedShare;
  }

  if (!backers.length && backerCount > 0 && totalBackerSharePct > 0) {
    return buildEqualSplitBackers(backerCount, totalBackerSharePct, 1);
  }

  var remainingShare = stakingRound2(Math.max(0, totalBackerSharePct - namedShare));
  if (remainingShare > 0) {
    var unnamedSlots = Math.max(0, backerCount - backers.length);
    if (unnamedSlots > 0) {
      backers = backers.concat(buildEqualSplitBackers(unnamedSlots, remainingShare, backers.length + 1));
    } else if (backers.length) {
      backers.push({ name: 'Other Backer', sharePct: remainingShare });
    }
  }

  return normalizeResolvedBackers(backers);
}

function collectSessionStakingData() {
  var packageEl = document.getElementById('s-package');
  var shareEl = document.getElementById('s-player-share');
  var markupEl = document.getElementById('s-markup');
  var backerCountEl = document.getElementById('s-backer-count');
  var backersEl = document.getElementById('s-backers');

  var packageName = packageEl ? normalizeStakingPackageName(packageEl.value) : '';
  var playerSharePct = shareEl ? shareEl.value : '';
  var markup = markupEl ? markupEl.value : '';
  var backerCount = backerCountEl ? backerCountEl.value : '';
  var backersText = backersEl ? backersEl.value : '';

  var data = {};
  if (packageName) data.packageName = packageName;

  var shareNum = parseFloat(playerSharePct);
  if (!isNaN(shareNum)) {
    data.playerSharePct = stakingRound2(stakingClamp(shareNum, 0, 100));
  }

  var markupInfo = normalizeStakingMarkup(markup, { strict: true });
  if (markupInfo.valid) {
    data.markup = markupInfo.value;
  }

  var parsedBackers = parseBackerAllocationsText(backersText);
  if (parsedBackers.length) {
    data.backers = parsedBackers;
  }

  var countNum = parseBackerCount(backerCount);
  var shouldCarryPackage = !packageName && (
    !isNaN(shareNum) ||
    !markupInfo.empty ||
    countNum > 0 ||
    parsedBackers.length > 0
  );
  if (shouldCarryPackage) {
    packageName = getLatestStakingPackageName();
    if (packageName && packageEl && !packageEl.value) packageEl.value = packageName;
  }
  if (packageName) {
    data.packageName = packageName;
    syncStakingPackageDraft(packageName);
  }

  if (countNum > 0 && (!isNaN(shareNum) || parsedBackers.length)) {
    data.backerCount = Math.max(countNum, parsedBackers.length);
  }

  if (isNaN(shareNum) && parsedBackers.length) {
    var soldPct = stakingRound2(parsedBackers.reduce(function(sum, backer) {
      return sum + backer.sharePct;
    }, 0));
    data.playerSharePct = stakingRound2(Math.max(0, 100 - soldPct));
  }

  return data;
}

function getSessionStakingData(session) {
  if (!session) return null;
  var packageName = normalizeStakingPackageName(session.packageName);
  var totalBuyIn = parseFloat(session.total);
  if (!totalBuyIn) totalBuyIn = (parseFloat(session.buyin) || 0) + (parseFloat(session.rebuy) || 0);

  var rawPlayerShare = parseFloat(session.playerSharePct);
  var rawBackerShare = parseFloat(session.backerSharePct);
  var markupInfo = normalizeStakingMarkup(session.markup, { strict: false });
  var storedBackerCount = parseBackerCount(session.backerCount);
  var storedBackers = normalizeStoredBackers(session.backers);
  var hasStaking =
    packageName ||
    !isNaN(rawPlayerShare) ||
    !isNaN(rawBackerShare) ||
    (markupInfo.valid && !markupInfo.empty) ||
    storedBackerCount > 0 ||
    storedBackers.length > 0;
  if (!hasStaking) return null;

  var playerSharePct = isNaN(rawPlayerShare) ? NaN : stakingClamp(rawPlayerShare, 0, 100);
  var backerSharePct = !isNaN(rawBackerShare)
    ? stakingClamp(rawBackerShare, 0, 100)
    : (isNaN(playerSharePct) ? 0 : Math.max(0, 100 - playerSharePct));
  var backers = resolveSessionBackers(session, backerSharePct);
  if (backers.length) {
    backerSharePct = stakingRound2(backers.reduce(function(sum, backer) {
      return sum + backer.sharePct;
    }, 0));
  } else {
    backerSharePct = stakingRound2(backerSharePct);
  }

  playerSharePct = stakingRound2(Math.max(0, 100 - backerSharePct));
  var markup = markupInfo.valid ? markupInfo.value : 1;
  var prize = parseFloat(session.prize) || 0;
  var packageValue = stakingRound2(totalBuyIn * markup);

  var backerResults = backers.map(function(backer) {
    var cost = stakingRound2(packageValue * (backer.sharePct / 100));
    var backerReturn = stakingRound2(prize * (backer.sharePct / 100));
    return {
      name: backer.name,
      sharePct: backer.sharePct,
      cost: cost,
      return: backerReturn,
      net: stakingRound2(backerReturn - cost)
    };
  });

  var backerCost = backerResults.length
    ? stakingRound2(backerResults.reduce(function(sum, backer) { return sum + backer.cost; }, 0))
    : stakingRound2(packageValue * (backerSharePct / 100));
  var playerCost = stakingRound2(totalBuyIn - backerCost);
  var backerReturn = backerResults.length
    ? stakingRound2(backerResults.reduce(function(sum, backer) { return sum + backer.return; }, 0))
    : stakingRound2(prize * (backerSharePct / 100));
  var backerNet = backerResults.length
    ? stakingRound2(backerResults.reduce(function(sum, backer) { return sum + backer.net; }, 0))
    : stakingRound2(backerReturn - backerCost);
  var playerReturn = stakingRound2((prize * (playerSharePct / 100)) + backerCost);
  var playerNet = stakingRound2(playerReturn - totalBuyIn);

  return {
    packageName: packageName,
    totalBuyIn: stakingRound2(totalBuyIn),
    playerSharePct: stakingRound2(playerSharePct),
    backerSharePct: stakingRound2(backerSharePct),
    markup: stakingRound2(markup),
    packageValue: packageValue,
    backerCount: backerResults.length ? backerResults.length : storedBackerCount,
    backers: backerResults,
    backerCost: backerCost,
    playerCost: playerCost,
    backerReturn: backerReturn,
    playerReturn: playerReturn,
    backerNet: backerNet,
    playerNet: playerNet,
    markupWasNormalized: !!markupInfo.autoNormalized,
    markupNote: markupInfo.reason || ''
  };
}

function renderStakingInputSummary() {
  var tipEl = document.getElementById('staking-tip');
  if (!tipEl) return;

  var packageEl = document.getElementById('s-package');
  var markupEl = document.getElementById('s-markup');
  var backerCountEl = document.getElementById('s-backer-count');
  var backersEl = document.getElementById('s-backers');
  var rawPackageName = normalizeStakingPackageName(packageEl ? packageEl.value : '');
  var markupInfo = normalizeStakingMarkup(markupEl ? markupEl.value : '', { strict: true });
  var namedBackers = parseBackerAllocationsText(backersEl ? backersEl.value : '');
  var backerCount = parseBackerCount(backerCountEl ? backerCountEl.value : '');

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
    tipEl.textContent = (!markupInfo.empty && !markupInfo.valid)
      ? markupInfo.reason
      : 'Optional: track sold action and package economics without changing your core session log.';
    return;
  }

  var details = [
    'Player ' + staking.playerSharePct.toFixed(0) + '%',
    'Backer ' + staking.backerSharePct.toFixed(0) + '%'
  ];

  if (namedBackers.length) {
    details.push(namedBackers.length + ' named backer' + (namedBackers.length !== 1 ? 's' : ''));
  } else if (backerCount > 0 && staking.backerSharePct > 0) {
    details.push(backerCount + ' backer' + (backerCount !== 1 ? 's' : '') + ' equal split');
  }

  details.push('Package value ' + stakingCurrency(staking.packageValue));
  if (!rawPackageName && formData.packageName) {
    details.push('Using last package: ' + formData.packageName);
  }
  if (markupInfo.autoNormalized) {
    details.push(markupInfo.reason.replace('Markup ', ''));
  } else if (!markupInfo.empty && !markupInfo.valid) {
    details.push(markupInfo.reason);
  }

  tipEl.textContent = details.join(' | ');
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
    var key = getStakingPackageGroupKey(staking.packageName);
    var label = getStakingPackageLabel(staking.packageName);
    if (!grouped[key]) {
      grouped[key] = {
        packageLabel: label,
        sessionCount: 0,
        latestSessionAt: 0,
        totalBuyIn: 0,
        packageValue: 0,
        playerCost: 0,
        backerCost: 0,
        playerNet: 0,
        backerNet: 0,
        prizes: 0
      };
    }
    grouped[key].latestSessionAt = Math.max(grouped[key].latestSessionAt, getStakingSessionSortValue(session));
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
    row.backerSharePct = row.packageValue ? stakingRound2((row.backerCost / row.packageValue) * 100) : 0;
    return row;
  }).sort(function(a, b) {
    if (a.packageLabel === 'Single Event' && b.packageLabel !== 'Single Event') return 1;
    if (b.packageLabel === 'Single Event' && a.packageLabel !== 'Single Event') return -1;
    if (b.latestSessionAt !== a.latestSessionAt) return b.latestSessionAt - a.latestSessionAt;
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

  html += '<div class="staking-table-wrap"><table class="tbl"><thead><tr><th>Package</th><th>Events</th><th>Total Buy-in</th><th>Package Value</th><th>Sold</th><th>Player Net</th><th>Backer Net</th></tr></thead><tbody>';
  packageRows.forEach(function(row) {
    var playerCls = row.playerNet > 0 ? 'profit-pos' : row.playerNet < 0 ? 'profit-neg' : 'profit-zero';
    var backerCls = row.backerNet > 0 ? 'profit-pos' : row.backerNet < 0 ? 'profit-neg' : 'profit-zero';
    html += '<tr><td>' + row.packageLabel + '</td><td>' + row.sessionCount + '</td><td>' + stakingCurrency(row.totalBuyIn) + '</td><td>' + stakingCurrency(row.packageValue) + '</td><td>' + row.backerSharePct.toFixed(1) + '%</td><td class="' + playerCls + '">' + fmtCur(row.playerNet) + '</td><td class="' + backerCls + '">' + fmtCur(row.backerNet) + '</td></tr>';
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
  lines.push('Package,Events,Total Buy-in,Package Value,Player Cost,Backer Cost,Backer Share %,Player Net,Backer Net,Prizes');
  packageRows.forEach(function(row) {
    lines.push([
      '"' + row.packageLabel.replace(/"/g, "''") + '"',
      row.sessionCount,
      row.totalBuyIn,
      row.packageValue,
      row.playerCost,
      row.backerCost,
      row.backerSharePct,
      row.playerNet,
      row.backerNet,
      row.prizes
    ].join(','));
  });

  lines.push('');
  lines.push('Date,Tournament,Package,Total Buy-in,Player Share %,Backer Share %,Markup,Package Value,Player Net,Backer Net,Backer Count,Backers');
  stakingSessions.forEach(function(session) {
    var staking = getSessionStakingData(session);
    var backerLabel = staking.backers.map(function(backer) {
      return backer.name + ' ' + backer.sharePct + '%';
    }).join(' | ');
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
      staking.backerNet,
      staking.backers.length || 0,
      '"' + backerLabel.replace(/"/g, "''") + '"'
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
