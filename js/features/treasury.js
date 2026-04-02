function initTreasuryFeature() {
  window.wallet = window.wallet || load('wallet', { balance: 0 });
  window.walletLedger = Array.isArray(window.walletLedger) ? window.walletLedger : load('walletLedger', []);
  wallet = window.wallet;
  walletLedger = window.walletLedger;
  var dateEl = document.getElementById('wallet-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
  updateWalletTransactionHelp();
  renderTreasury();
}

function getWalletTransactionMeta(type) {
  var map = {
    deposit: { label: 'Deposit', walletDelta: 1, bankrollDelta: 0 },
    withdrawal: { label: 'Withdrawal', walletDelta: -1, bankrollDelta: 0 },
    bankroll_topup: { label: 'Bankroll Top-up', walletDelta: -1, bankrollDelta: 1 },
    bankroll_pullout: { label: 'Bankroll Pullout', walletDelta: 1, bankrollDelta: -1 },
    staking_received: { label: 'Staking Received', walletDelta: 1, bankrollDelta: 0 },
    staking_payout: { label: 'Staking Payout', walletDelta: -1, bankrollDelta: 0 },
    expense: { label: 'Expense', walletDelta: -1, bankrollDelta: 0 },
    adjustment: { label: 'Adjustment', walletDelta: 0, bankrollDelta: 0 }
  };
  return map[type] || map.deposit;
}

function walletTransactionRequiresNotes(type) {
  return type === 'withdrawal' || type === 'bankroll_pullout' || type === 'expense' || type === 'staking_payout';
}

function normalizeWalletLedgerEntry(entry) {
  var item = entry && typeof entry === 'object' ? entry : {};
  var type = item.type || 'deposit';
  var amount = parseFloat(item.amount);
  amount = isFinite(amount) ? amount : 0;
  var deltas = getWalletTransactionDeltas(type, amount);
  return {
    id: item.id || Date.now(),
    date: item.date || '',
    type: type,
    amount: amount,
    notes: item.notes || '',
    walletDelta: typeof item.walletDelta === 'number' ? item.walletDelta : deltas.walletDelta,
    bankrollDelta: typeof item.bankrollDelta === 'number' ? item.bankrollDelta : deltas.bankrollDelta,
    walletBalanceAfter: typeof item.walletBalanceAfter === 'number' ? item.walletBalanceAfter : null,
    bankrollBalanceAfter: typeof item.bankrollBalanceAfter === 'number' ? item.bankrollBalanceAfter : null
  };
}

function getWalletTransactionDeltas(type, amount) {
  var absAmount = Math.abs(parseFloat(amount) || 0);
  if (type === 'adjustment') {
    return { walletDelta: parseFloat(amount) || 0, bankrollDelta: 0 };
  }
  if (type === 'withdrawal' || type === 'staking_payout' || type === 'expense') {
    return { walletDelta: -absAmount, bankrollDelta: 0 };
  }
  if (type === 'bankroll_topup') {
    return { walletDelta: -absAmount, bankrollDelta: absAmount };
  }
  if (type === 'bankroll_pullout') {
    return { walletDelta: absAmount, bankrollDelta: -absAmount };
  }
  return { walletDelta: absAmount, bankrollDelta: 0 };
}

function getWalletLedgerSorted() {
  var entries = (window.walletLedger || []).map(normalizeWalletLedgerEntry);
  entries.sort(function(a, b) {
    var aTime = Date.parse(a.date || '') || 0;
    var bTime = Date.parse(b.date || '') || 0;
    if (aTime !== bTime) return bTime - aTime;
    return (b.id || 0) - (a.id || 0);
  });
  return entries;
}

function getTreasuryStats() {
  var entries = getWalletLedgerSorted();
  var topups = 0;
  var pullouts = 0;
  entries.forEach(function(entry) {
    if (entry.type === 'bankroll_topup') topups += Math.abs(entry.amount || 0);
    if (entry.type === 'bankroll_pullout') pullouts += Math.abs(entry.amount || 0);
  });
  return {
    walletBalance: wallet && typeof wallet.balance === 'number' ? wallet.balance : 0,
    bankrollBalance: bankroll && typeof bankroll.amount === 'number' ? bankroll.amount : 0,
    topups: topups,
    pullouts: pullouts,
    netToBankroll: topups - pullouts,
    entries: entries
  };
}

function fmtTreasurySigned(amount) {
  var n = Math.round(parseFloat(amount) || 0);
  if (!n) return '₱0';
  return (n > 0 ? '+₱' : '−₱') + Math.abs(n).toLocaleString();
}

function formatWalletTypeLabel(type) {
  return getWalletTransactionMeta(type).label;
}

function updateWalletTransactionHelp() {
  var typeEl = document.getElementById('wallet-type');
  var tipEl = document.getElementById('wallet-entry-tip');
  var notesEl = document.getElementById('wallet-notes');
  var labelEl = document.getElementById('wallet-notes-label');
  var amountEl = document.getElementById('wallet-amount');
  if (!typeEl) return;
  var type = typeEl.value || 'deposit';
  var notesRequired = walletTransactionRequiresNotes(type);
  if (labelEl) labelEl.textContent = notesRequired ? 'Notes / Destination (Required)' : 'Notes / Destination';
  if (notesEl) {
    notesEl.placeholder = notesRequired ? 'Required detail, destination, or counterparty' : 'Optional detail, destination, or counterparty';
  }
  if (amountEl) {
    amountEl.placeholder = type === 'adjustment' ? 'Use positive or negative amount' : 'e.g. 5000';
  }
  if (tipEl) {
    var messageMap = {
      deposit: 'Deposit adds money to the wallet only.',
      withdrawal: 'Withdrawal reduces the wallet only. Add where the money went.',
      bankroll_topup: 'Bankroll top-up moves money out of wallet and into bankroll.',
      bankroll_pullout: 'Bankroll pullout moves money out of bankroll and back into wallet.',
      staking_received: 'Staking received adds external staking cash to the wallet only.',
      staking_payout: 'Staking payout reduces the wallet only. Add who was paid.',
      expense: 'Expense reduces the wallet only. Add what the spend covered.',
      adjustment: 'Adjustment corrects the wallet balance only. Use a negative amount to reduce.'
    };
    tipEl.textContent = messageMap[type] || messageMap.deposit;
  }
}

function addWalletTransaction() {
  var type = (document.getElementById('wallet-type') || {}).value || 'deposit';
  var date = (document.getElementById('wallet-date') || {}).value || new Date().toISOString().split('T')[0];
  var rawAmount = parseFloat((document.getElementById('wallet-amount') || {}).value);
  var notes = ((document.getElementById('wallet-notes') || {}).value || '').trim();
  var amount = type === 'adjustment' ? (isFinite(rawAmount) ? rawAmount : 0) : Math.abs(isFinite(rawAmount) ? rawAmount : 0);
  if (!amount) {
    alert(type === 'adjustment' ? 'Enter a non-zero adjustment amount.' : 'Enter an amount greater than zero.');
    return;
  }
  if (walletTransactionRequiresNotes(type) && !notes) {
    alert('Add a note or destination for this transaction.');
    return;
  }

  wallet = window.wallet || { balance: 0 };
  bankroll = window.bankroll || { amount: 0, rule: 15 };
  walletLedger = Array.isArray(window.walletLedger) ? window.walletLedger : [];

  var deltas = getWalletTransactionDeltas(type, amount);
  var nextWalletBalance = (wallet.balance || 0) + deltas.walletDelta;
  var nextBankrollBalance = (bankroll.amount || 0) + deltas.bankrollDelta;

  if (nextWalletBalance < 0) {
    alert('This entry would push the wallet below zero. Add a deposit or smaller amount first.');
    return;
  }
  if (nextBankrollBalance < 0) {
    alert('This transfer would push the bankroll below zero.');
    return;
  }

  var entry = {
    id: Date.now(),
    date: date,
    type: type,
    amount: amount,
    notes: notes,
    walletDelta: deltas.walletDelta,
    bankrollDelta: deltas.bankrollDelta,
    walletBalanceAfter: nextWalletBalance,
    bankrollBalanceAfter: nextBankrollBalance
  };

  wallet.balance = nextWalletBalance;
  bankroll.amount = nextBankrollBalance;
  walletLedger.unshift(entry);

  window.wallet = wallet;
  window.bankroll = bankroll;
  window.walletLedger = walletLedger;
  save('wallet', wallet);
  save('walletLedger', walletLedger);
  save('bankroll', bankroll);

  var amountEl = document.getElementById('wallet-amount');
  var notesEl = document.getElementById('wallet-notes');
  if (amountEl) amountEl.value = '';
  if (notesEl) notesEl.value = '';

  if (typeof loadBankrollForm === 'function') loadBankrollForm();
  if (typeof updateBRMTip === 'function') updateBRMTip();
  if (typeof refreshDashboard === 'function') refreshDashboard();
  renderTreasury();
}

function renderTreasury() {
  wallet = window.wallet || { balance: 0 };
  walletLedger = Array.isArray(window.walletLedger) ? window.walletLedger : [];
  bankroll = window.bankroll || { amount: 0, rule: 15 };

  var dateEl = document.getElementById('wallet-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

  var stats = getTreasuryStats();
  var walletEl = document.getElementById('wallet-balance-current');
  var bankrollEl = document.getElementById('wallet-bankroll-current');
  var topupsEl = document.getElementById('wallet-topups-total');
  var pulloutsEl = document.getElementById('wallet-pullouts-total');
  var tipEl = document.getElementById('wallet-transfer-tip');
  var countEl = document.getElementById('wallet-transaction-count');
  var listEl = document.getElementById('wallet-recent-list');

  if (walletEl) walletEl.textContent = fmtCur(stats.walletBalance);
  if (bankrollEl) bankrollEl.textContent = fmtCur(stats.bankrollBalance);
  if (topupsEl) topupsEl.textContent = fmtCur(stats.topups);
  if (pulloutsEl) pulloutsEl.textContent = fmtCur(stats.pullouts);
  if (tipEl) {
    var netClass = stats.netToBankroll > 0 ? 'positive' : (stats.netToBankroll < 0 ? 'negative' : '');
    tipEl.innerHTML = 'Net transfer to bankroll: <span class="treasury-signed ' + netClass + '">' + formatTreasuryHTML(fmtTreasurySigned(stats.netToBankroll)) + '</span>';
  }
  if (countEl) countEl.textContent = stats.entries.length === 1 ? '1 entry' : stats.entries.length + ' entries';

  if (!listEl) return;
  if (!stats.entries.length) {
    listEl.innerHTML = '<div class="treasury-empty">No treasury entries yet. Add a deposit, bankroll transfer, payout, or expense to start the ledger.</div>';
    return;
  }

  var rows = stats.entries.slice(0, 10).map(function(entry) {
    var walletClass = entry.walletDelta > 0 ? 'positive' : (entry.walletDelta < 0 ? 'negative' : '');
    var bankrollClass = entry.bankrollDelta > 0 ? 'positive' : (entry.bankrollDelta < 0 ? 'negative' : '');
    return '<tr>'
      + '<td>' + formatTreasuryHTML(entry.date || '—') + '</td>'
      + '<td>' + formatTreasuryHTML(formatWalletTypeLabel(entry.type)) + '</td>'
      + '<td><span class="treasury-signed ' + walletClass + '">' + formatTreasuryHTML(fmtTreasurySigned(entry.walletDelta)) + '</span></td>'
      + '<td><span class="treasury-signed ' + bankrollClass + '">' + formatTreasuryHTML(fmtTreasurySigned(entry.bankrollDelta)) + '</span></td>'
      + '<td>' + formatTreasuryHTML(entry.notes || '—') + '</td>'
      + '</tr>';
  }).join('');

  listEl.innerHTML = '<div class="table-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Type</th><th>Wallet</th><th>Bankroll</th><th>Notes / Destination</th></tr></thead><tbody>'
    + rows
    + '</tbody></table></div>';
}

function formatTreasuryHTML(value) {
  if (typeof esc === 'function') return esc(value);
  return String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
