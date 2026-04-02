var _selectedStakingReportPackage = '';

function packageReportRound(value) {
  return Math.round((value || 0) * 100) / 100;
}

function packageReportCurrency(value) {
  return 'PHP ' + Math.round(value || 0).toLocaleString();
}

function packageReportSigned(value) {
  if (typeof fmtCur === 'function') return fmtCur(value || 0);
  var rounded = Math.round(value || 0);
  return (rounded >= 0 ? '+PHP ' : '-PHP ') + Math.abs(rounded).toLocaleString();
}

function packageReportSafe(value, fallback) {
  return value || fallback || '-';
}

function packageReportSlug(value) {
  return String(value || 'package')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'package';
}

function getSessionInvestmentBreakdown(session) {
  var buyin = parseFloat(session && session.buyin) || 0;
  var total = parseFloat(session && session.total);
  if (!total) total = buyin + (parseFloat(session && session.rebuy) || 0);
  var rebuysAddons = parseFloat(session && session.rebuy);
  if (isNaN(rebuysAddons)) rebuysAddons = Math.max(0, total - buyin);
  return {
    buyin: packageReportRound(buyin),
    rebuysAddons: packageReportRound(rebuysAddons),
    totalInvested: packageReportRound(total)
  };
}

function getPackageReportEventSortValue(session) {
  if (!session) return 0;
  var parsed = Date.parse(session.date || '');
  if (!isNaN(parsed)) return parsed;
  var numericId = parseInt(session.id, 10);
  return isNaN(numericId) ? 0 : numericId;
}

function getSelectedStakingReportPackage(packageRows) {
  if (!packageRows.length) return '';
  var exists = packageRows.some(function(row) { return row.packageLabel === _selectedStakingReportPackage; });
  if (!exists) {
    var preferred = packageRows.find(function(row) { return row.packageLabel !== 'Single Event'; });
    _selectedStakingReportPackage = (preferred || packageRows[0]).packageLabel;
  }
  return _selectedStakingReportPackage;
}

function setSelectedStakingReportPackage(value) {
  _selectedStakingReportPackage = value || '';
  if (typeof renderStakingSummary === 'function') renderStakingSummary();
}

function packageReportShare(value) {
  return packageReportRound(value).toFixed(1) + '%';
}

function packageReportEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getPackagePickerOptionLabel(row) {
  if (!row) return '';
  var count = parseInt(row.sessionCount, 10) || 0;
  return row.packageLabel + ' (' + count + ' event' + (count !== 1 ? 's' : '') + ')';
}

function getLegacyUnassignedStakingSessions() {
  if (typeof getStakingSessions !== 'function') return [];
  return getStakingSessions().filter(function(session) {
    return !(typeof normalizeStakingPackageName === 'function'
      ? normalizeStakingPackageName(session && session.packageName)
      : String(session && session.packageName || '').trim());
  });
}

function getSuggestedRepairPackageLabel(packageRows, selectedLabel) {
  var normalizedSelected = typeof getStakingPackageLabel === 'function'
    ? getStakingPackageLabel(selectedLabel)
    : (String(selectedLabel || '').trim() || 'Single Event');
  if (normalizedSelected !== 'Single Event') return normalizedSelected;
  for (var i = 0; i < packageRows.length; i++) {
    if (packageRows[i].packageLabel !== 'Single Event') return packageRows[i].packageLabel;
  }
  if (typeof getLatestStakingPackageName === 'function') {
    return getLatestStakingPackageName();
  }
  return '';
}

function repairLegacyStakingPackageAssignments() {
  var input = document.getElementById('staking-report-repair-package');
  if (!input) return;
  var targetPackage = typeof normalizeStakingPackageName === 'function'
    ? normalizeStakingPackageName(input.value)
    : String(input.value || '').replace(/\s+/g, ' ').trim();
  if (!targetPackage) {
    alert('Enter the package name to assign to unlabeled staking sessions.');
    return;
  }
  if (targetPackage === 'Single Event') {
    alert('Choose a real package name for the repair.');
    return;
  }
  if (!window.sessions || !window.sessions.length) return;

  var changed = 0;
  window.sessions = window.sessions.map(function(session) {
    var staking = typeof getSessionStakingData === 'function' ? getSessionStakingData(session) : null;
    var currentPackage = typeof normalizeStakingPackageName === 'function'
      ? normalizeStakingPackageName(session && session.packageName)
      : String(session && session.packageName || '').trim();
    if (!staking || currentPackage) return session;
    changed += 1;
    return Object.assign({}, session, { packageName: targetPackage });
  });
  sessions = window.sessions;
  if (!changed) {
    alert('No unlabeled staking sessions were found to repair.');
    return;
  }
  if (typeof save === 'function') save('sessions', sessions);
  _selectedStakingReportPackage = targetPackage;
  if (typeof renderStakingSummary === 'function') renderStakingSummary();
  alert('Assigned ' + changed + ' staking session' + (changed !== 1 ? 's' : '') + ' to ' + targetPackage + '.');
}

function buildStakingPackageReport(label) {
  if (typeof getStakingSessions !== 'function' || typeof getSessionStakingData !== 'function') return null;
  var targetKey = typeof getStakingPackageGroupKey === 'function'
    ? getStakingPackageGroupKey(label)
    : String(label || 'Single Event').toLowerCase();
  var packageLabel = '';
  var events = getStakingSessions().filter(function(session) {
    var staking = getSessionStakingData(session);
    if (!staking) return false;
    var eventKey = typeof getStakingPackageGroupKey === 'function'
      ? getStakingPackageGroupKey(staking.packageName)
      : String(staking.packageName || 'Single Event').toLowerCase();
    return eventKey === targetKey;
  }).map(function(session) {
    var staking = getSessionStakingData(session);
    if (!packageLabel) {
      packageLabel = typeof getStakingPackageLabel === 'function'
        ? getStakingPackageLabel(staking.packageName)
        : (String(staking.packageName || '').trim() || 'Single Event');
    }
    var investment = getSessionInvestmentBreakdown(session);
    var prize = packageReportRound(parseFloat(session.prize) || 0);
    return {
      packageLabel: packageLabel,
      sessionName: session.name || 'Session',
      date: session.date || '',
      venue: session.venue || '',
      buyin: investment.buyin,
      rebuysAddons: investment.rebuysAddons,
      totalInvested: investment.totalInvested,
      markup: packageReportRound(staking.markup),
      packageValue: packageReportRound(staking.packageValue),
      playerSharePct: packageReportRound(staking.playerSharePct),
      backerSharePct: packageReportRound(staking.backerSharePct),
      prize: prize,
      grossResult: packageReportRound(prize - investment.totalInvested),
      backerCost: packageReportRound(staking.backerCost),
      backerReturn: packageReportRound(staking.backerReturn),
      playerNet: packageReportRound(staking.playerNet),
      backerNet: packageReportRound(staking.backerNet),
      backers: Array.isArray(staking.backers) ? staking.backers.map(function(backer) {
        return {
          name: backer.name || 'Backer',
          sharePct: packageReportRound(backer.sharePct),
          cost: packageReportRound(backer.cost),
          return: packageReportRound(backer.return),
          net: packageReportRound(backer.net)
        };
      }).sort(function(a, b) {
        if (b.sharePct !== a.sharePct) return b.sharePct - a.sharePct;
        return a.name.localeCompare(b.name);
      }) : []
    };
  }).sort(function(a, b) {
    return getPackageReportEventSortValue(b) - getPackageReportEventSortValue(a);
  });

  if (!events.length) return null;
  if (!packageLabel) {
    packageLabel = typeof getStakingPackageLabel === 'function'
      ? getStakingPackageLabel(label)
      : (String(label || '').trim() || 'Single Event');
  }

  var totalPackageValue = packageReportRound(events.reduce(function(sum, event) {
    return sum + event.packageValue;
  }, 0));
  var backerMap = {};
  events.forEach(function(event) {
    event.backers.forEach(function(backer) {
      var key = backer.name || 'Backer';
      if (!backerMap[key]) {
        backerMap[key] = { name: key, cost: 0, return: 0, net: 0 };
      }
      backerMap[key].cost += backer.cost;
      backerMap[key].return += backer.return;
      backerMap[key].net += backer.net;
    });
  });

  var summaryBackers = Object.keys(backerMap).map(function(key) {
    var backer = backerMap[key];
    backer.cost = packageReportRound(backer.cost);
    backer.return = packageReportRound(backer.return);
    backer.net = packageReportRound(backer.net);
    backer.sharePct = totalPackageValue ? packageReportRound((backer.cost / totalPackageValue) * 100) : 0;
    return backer;
  }).sort(function(a, b) {
    if (b.sharePct !== a.sharePct) return b.sharePct - a.sharePct;
    return a.name.localeCompare(b.name);
  });

  return {
    packageLabel: packageLabel,
    events: events,
    summary: {
      eventCount: events.length,
      totalPackageValue: totalPackageValue,
      totalReturn: packageReportRound(events.reduce(function(sum, event) { return sum + event.prize; }, 0)),
      totalBackerSharePct: totalPackageValue ? packageReportRound((events.reduce(function(sum, event) { return sum + event.backerCost; }, 0) / totalPackageValue) * 100) : 0,
      totalPlayerNet: packageReportRound(events.reduce(function(sum, event) { return sum + event.playerNet; }, 0)),
      totalBackerNet: packageReportRound(events.reduce(function(sum, event) { return sum + event.backerNet; }, 0)),
      backers: summaryBackers
    }
  };
}

function buildPackageBackerSummaryList(backers, title) {
  if (!backers || !backers.length) return '';
  var html = '<div class="staking-report-backers">';
  html += '<div class="staking-report-backers-title">' + packageReportEscape(title) + '</div>';
  html += '<div class="staking-report-backer-table">';
  html += '<div class="staking-report-backer-row staking-report-backer-head"><span>Backer</span><span>Share</span><span>Cost</span><span>Return</span><span>Net</span></div>';
  backers.forEach(function(backer) {
    html += '<div class="staking-report-backer-row">';
    html += '<span>' + packageReportEscape(backer.name || 'Backer') + '</span>';
    html += '<span>' + packageReportShare(backer.sharePct) + '</span>';
    html += '<span>' + packageReportCurrency(backer.cost) + '</span>';
    html += '<span>' + packageReportCurrency(backer.return) + '</span>';
    html += '<span class="' + (backer.net >= 0 ? 'staking-up' : 'staking-down') + '">' + packageReportSigned(backer.net) + '</span>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

function buildStakingPackagePreview(report) {
  if (!report) return '';
  var summary = report.summary;
  var latestEvent = report.events.length ? report.events[0] : null;
  var safePackageLabel = packageReportEscape(report.packageLabel);
  var html = '<div class="staking-report-preview">';
  html += '<div class="staking-report-preview-head">';
  html += '<div><div class="staking-report-preview-kicker">Backer Package Report</div><div class="staking-report-preview-title">' + safePackageLabel + '</div><div class="staking-report-preview-sub">' + summary.eventCount + ' event' + (summary.eventCount !== 1 ? 's' : '') + ' tracked for this package.</div></div>';
  html += '</div>';

  html += '<div class="staking-report-preview-grid">';
  html += '<div class="staking-report-metric"><div class="staking-report-metric-label">Events</div><div class="staking-report-metric-value">' + summary.eventCount + '</div></div>';
  html += '<div class="staking-report-metric"><div class="staking-report-metric-label">Package Value</div><div class="staking-report-metric-value">' + packageReportCurrency(summary.totalPackageValue) + '</div></div>';
  html += '<div class="staking-report-metric"><div class="staking-report-metric-label">Total Return</div><div class="staking-report-metric-value">' + packageReportCurrency(summary.totalReturn) + '</div></div>';
  html += '<div class="staking-report-metric"><div class="staking-report-metric-label">Total Backer Share</div><div class="staking-report-metric-value">' + packageReportShare(summary.totalBackerSharePct) + '</div></div>';
  html += '<div class="staking-report-metric"><div class="staking-report-metric-label">Player Net</div><div class="staking-report-metric-value ' + (summary.totalPlayerNet >= 0 ? 'staking-up' : 'staking-down') + '">' + packageReportSigned(summary.totalPlayerNet) + '</div></div>';
  html += '<div class="staking-report-metric"><div class="staking-report-metric-label">Backer Net</div><div class="staking-report-metric-value ' + (summary.totalBackerNet >= 0 ? 'staking-up' : 'staking-down') + '">' + packageReportSigned(summary.totalBackerNet) + '</div></div>';
  html += '</div>';
  html += buildPackageBackerSummaryList(summary.backers, 'Package Backers');

  if (latestEvent) {
    html += '<div class="staking-report-preview-list">';
    if (summary.eventCount > 1) {
      html += '<div class="staking-report-preview-sub" style="margin-bottom:12px">Showing the most recent event on-screen. Export PDF for the full package history.</div>';
    }
    var event = latestEvent;
    html += '<div class="staking-report-card">';
    html += '<div class="staking-report-card-top"><div><div class="staking-report-card-title">' + packageReportEscape(event.sessionName) + '</div><div class="staking-report-card-meta">' + packageReportSafe(event.date) + ' | ' + packageReportSafe(event.venue) + '</div></div><div class="staking-report-card-badge">' + event.playerSharePct.toFixed(0) + '% / ' + event.backerSharePct.toFixed(0) + '%</div></div>';
    html += '<div class="staking-report-card-grid">';
    html += '<div class="staking-report-row"><span>Total Buy-in</span><strong>' + packageReportCurrency(event.buyin) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Rebuys / Add-ons</span><strong>' + packageReportCurrency(event.rebuysAddons) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Total Invested</span><strong>' + packageReportCurrency(event.totalInvested) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Markup</span><strong>' + event.markup.toFixed(2) + 'x</strong></div>';
    html += '<div class="staking-report-row"><span>Package Value</span><strong>' + packageReportCurrency(event.packageValue) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Total Backer Share</span><strong>' + packageReportShare(event.backerSharePct) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Prize</span><strong>' + packageReportCurrency(event.prize) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Gross Result</span><strong class="' + (event.grossResult >= 0 ? 'staking-up' : 'staking-down') + '">' + packageReportSigned(event.grossResult) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Total Backer Net</span><strong class="' + (event.backerNet >= 0 ? 'staking-up' : 'staking-down') + '">' + packageReportSigned(event.backerNet) + '</strong></div>';
    html += '<div class="staking-report-row"><span>Player Net</span><strong class="' + (event.playerNet >= 0 ? 'staking-up' : 'staking-down') + '">' + packageReportSigned(event.playerNet) + '</strong></div>';
    html += '</div></div>';
    html += buildPackageBackerSummaryList(event.backers, 'Per-Backer Result');
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function enhanceStakingSummaryWithReports() {
  if (typeof getStakingPackageRows !== 'function') return;
  var wrap = document.getElementById('staking-summary-wrap');
  if (!wrap) return;
  var packageRows = getStakingPackageRows();
  if (!packageRows.length) return;
  var legacySessions = getLegacyUnassignedStakingSessions();

  var oldControls = document.getElementById('staking-report-controls');
  if (oldControls) oldControls.remove();
  var oldPreview = document.getElementById('staking-report-preview-wrap');
  if (oldPreview) oldPreview.remove();

  var selectedLabel = getSelectedStakingReportPackage(packageRows);
  var report = buildStakingPackageReport(selectedLabel);
  if (!report) return;

  var controls = document.createElement('div');
  controls.id = 'staking-report-controls';
  controls.className = 'staking-report-controls';
  controls.innerHTML =
    '<div class="form-group staking-report-picker">' +
      '<label class="form-label">Backer Package Report</label>' +
      '<select class="form-input" id="staking-report-select"></select>' +
    '</div>' +
    '<div class="staking-report-actions">' +
      '<button class="sec-action primary" onclick="exportBackerPackageReportPDF()">EXPORT BACKER PDF</button>' +
    '</div>' +
    (legacySessions.length ? (
      '<div class="staking-report-repair">' +
        '<div class="form-group staking-report-repair-input">' +
          '<label class="form-label">Repair ' + legacySessions.length + ' Unlabeled Staking Session' + (legacySessions.length !== 1 ? 's' : '') + '</label>' +
          '<input class="form-input" type="text" id="staking-report-repair-package" placeholder="Assign to package">' +
          '<div class="staking-report-repair-note">Updates only historical staking sessions currently grouped as Single Event because their package name was blank.</div>' +
        '</div>' +
        '<button class="sec-action" onclick="repairLegacyStakingPackageAssignments()">ASSIGN PACKAGE</button>' +
      '</div>'
    ) : '');
  wrap.appendChild(controls);

  var select = document.getElementById('staking-report-select');
  if (select) {
    select.innerHTML = packageRows.map(function(row) {
      return '<option value="' + packageReportEscape(row.packageLabel) + '"' + (row.packageLabel === selectedLabel ? ' selected' : '') + '>' + packageReportEscape(getPackagePickerOptionLabel(row)) + '</option>';
    }).join('');
    select.onchange = function() {
      setSelectedStakingReportPackage(this.value);
    };
  }

  var repairInput = document.getElementById('staking-report-repair-package');
  if (repairInput && !repairInput.value) {
    repairInput.value = getSuggestedRepairPackageLabel(packageRows, selectedLabel);
  }

  var preview = document.createElement('div');
  preview.id = 'staking-report-preview-wrap';
  preview.innerHTML = buildStakingPackagePreview(report);
  wrap.appendChild(preview);
}

function writePackagePdfMetric(doc, x, y, width, label, value) {
  doc.setFillColor(247, 247, 247);
  doc.roundedRect(x, y, width, 16, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(label, x + 3, y + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(35, 35, 35);
  doc.text(String(value), x + 3, y + 11);
}

function fitPackagePdfText(doc, value, maxWidth) {
  var text = String(value == null ? '' : value);
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxWidth) return text;
  while (text.length && doc.getTextWidth(text + '...') > maxWidth) {
    text = text.slice(0, -1);
  }
  return text ? text + '...' : '...';
}

function getPackagePdfTextLines(doc, value, maxWidth) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return ['-'];
  if (typeof doc.splitTextToSize === 'function') {
    var lines = doc.splitTextToSize(text, maxWidth);
    return lines && lines.length ? lines : ['-'];
  }
  return [fitPackagePdfText(doc, text, maxWidth)];
}

function getPackagePdfBackersHeight(backers) {
  if (!backers || !backers.length) return 0;
  return 14 + (backers.length * 5);
}

function writePackagePdfLine(doc, label, value, x, y, color) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(110, 110, 110);
  doc.text(label, x, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor.apply(doc, color || [40, 40, 40]);
  doc.text(String(value), x + 46, y);
}

function writePackagePdfBackers(doc, backers, x, y, width, title) {
  if (!backers || !backers.length) return 0;
  var rowHeight = 5;
  var boxHeight = 10 + (backers.length * rowHeight);
  doc.setFillColor(248, 248, 248);
  doc.setDrawColor(225, 225, 225);
  doc.roundedRect(x, y, width, boxHeight, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(String(title || 'Backers'), x + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Backer', x + 3, y + 10);
  doc.text('Share', x + 52, y + 10);
  doc.text('Net', x + width - 22, y + 10);
  backers.forEach(function(backer, index) {
    var rowY = y + 14 + (index * rowHeight);
    doc.setTextColor(40, 40, 40);
    doc.text(fitPackagePdfText(doc, String(backer.name || 'Backer'), 46), x + 3, rowY);
    doc.text(packageReportShare(backer.sharePct), x + 52, rowY);
    doc.setTextColor.apply(doc, backer.net >= 0 ? [26, 122, 74] : [192, 57, 43]);
    doc.text(packageReportSigned(backer.net), x + width - 22, rowY, { align: 'right' });
  });
  return boxHeight + 4;
}

function exportBackerPackageReportPDF(packageLabel) {
  var report = buildStakingPackageReport(packageLabel || _selectedStakingReportPackage);
  if (!report) {
    alert('No staking package report is available yet.');
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert('PDF export is unavailable right now.');
    return;
  }

  try {
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    var ML = 15;
    var MT = 16;
    var CW = 180;
    var y = MT;

    function checkPage(height) {
      if (y + height <= 282) return;
      doc.addPage();
      y = MT;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(21);
    doc.setTextColor(212, 175, 55);
    doc.text('POKERHQ - BACKER PACKAGE REPORT', ML, y);
    y += 4;
    doc.setFillColor(212, 175, 55);
    doc.rect(ML, y, CW, 0.7, 'F');
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    var reportHeaderLines = getPackagePdfTextLines(
      doc,
      report.packageLabel + ' | ' + new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
      CW
    );
    doc.text(reportHeaderLines, ML, y);
    y += (reportHeaderLines.length * 4) + 4;

    var metricWidth = (CW - 8) / 3;
    writePackagePdfMetric(doc, ML, y, metricWidth, 'Events', report.summary.eventCount);
    writePackagePdfMetric(doc, ML + metricWidth + 4, y, metricWidth, 'Package Value', packageReportCurrency(report.summary.totalPackageValue));
    writePackagePdfMetric(doc, ML + ((metricWidth + 4) * 2), y, metricWidth, 'Total Return', packageReportCurrency(report.summary.totalReturn));
    y += 20;
    writePackagePdfMetric(doc, ML, y, metricWidth, 'Backer Share', packageReportShare(report.summary.totalBackerSharePct));
    writePackagePdfMetric(doc, ML + metricWidth + 4, y, metricWidth, 'Player Net', packageReportSigned(report.summary.totalPlayerNet));
    writePackagePdfMetric(doc, ML + ((metricWidth + 4) * 2), y, metricWidth, 'Backer Net', packageReportSigned(report.summary.totalBackerNet));
    y += 24;

    if (report.summary.backers.length) {
      checkPage((report.summary.backers.length * 5) + 20);
      y += writePackagePdfBackers(doc, report.summary.backers, ML, y, CW, 'Package Backers');
    }

    report.events.forEach(function(event) {
      var titleLines = getPackagePdfTextLines(doc, event.sessionName, CW - 8);
      var metaLines = getPackagePdfTextLines(doc, packageReportSafe(event.date) + ' | ' + packageReportSafe(event.venue), CW - 8);
      var headerOffset = 6 + (titleLines.length * 4.4) + 1 + (metaLines.length * 3.6) + 4;
      var baseHeight = headerOffset + 26;
      var boxHeight = baseHeight + getPackagePdfBackersHeight(event.backers);
      checkPage(boxHeight + 4);
      var detailsStartY = y + headerOffset;
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(252, 252, 252);
      doc.roundedRect(ML, y, CW, boxHeight, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(35, 35, 35);
      doc.text(titleLines, ML + 4, y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(metaLines, ML + 4, y + 6 + (titleLines.length * 4.4) + 1);

      writePackagePdfLine(doc, 'Total buy-in', packageReportCurrency(event.buyin), ML + 4, detailsStartY);
      writePackagePdfLine(doc, 'Rebuys / add-ons', packageReportCurrency(event.rebuysAddons), ML + 92, detailsStartY);
      writePackagePdfLine(doc, 'Total invested', packageReportCurrency(event.totalInvested), ML + 4, detailsStartY + 6);
      writePackagePdfLine(doc, 'Markup', event.markup.toFixed(2) + 'x', ML + 92, detailsStartY + 6);
      writePackagePdfLine(doc, 'Package value', packageReportCurrency(event.packageValue), ML + 4, detailsStartY + 12);
      writePackagePdfLine(doc, 'Prize', packageReportCurrency(event.prize), ML + 92, detailsStartY + 12);
      writePackagePdfLine(doc, 'Backer share', packageReportShare(event.backerSharePct), ML + 4, detailsStartY + 18);
      writePackagePdfLine(doc, 'Gross result', packageReportSigned(event.grossResult), ML + 92, detailsStartY + 18, event.grossResult >= 0 ? [26, 122, 74] : [192, 57, 43]);
      writePackagePdfLine(doc, 'Player net', packageReportSigned(event.playerNet), ML + 4, detailsStartY + 24, event.playerNet >= 0 ? [26, 122, 74] : [192, 57, 43]);
      writePackagePdfLine(doc, 'Backer net', packageReportSigned(event.backerNet), ML + 92, detailsStartY + 24, event.backerNet >= 0 ? [26, 122, 74] : [192, 57, 43]);
      if (event.backers.length) {
        y += baseHeight;
        y += writePackagePdfBackers(doc, event.backers, ML + 4, y, CW - 8, 'Per-Backer Result');
      } else {
        y += boxHeight + 2;
      }
    });

    doc.save('PokerHQ_Backer_Report_' + packageReportSlug(report.packageLabel) + '_' + new Date().toISOString().split('T')[0] + '.pdf');
  } catch (err) {
    alert('Backer PDF error: ' + err.message);
  }
}

(function installPackageReportEnhancement() {
  var baseRender = typeof renderStakingSummary === 'function' ? renderStakingSummary : null;
  if (!baseRender) return;
  window.renderStakingSummary = function() {
    baseRender();
    enhanceStakingSummaryWithReports();
  };
})();
