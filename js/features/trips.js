// Trips & True ROI: the section at the bottom of Treasury, the two pop-ups (trip, cost), and the trip /
// satellite-seat fields on the session and satellite forms. The maths is js/data/trueroi.js
// (window.PokerHQTrueRoi); trips and their costs are the synced lists `trips` and `tripExpenses`.
// Trip costs are separate from the wallet and the bankroll: they never move either balance.

var _editingTripId = null;
var _editingCostId = null;
var _costTripId = null;

function trueRoi() { return window.PokerHQTrueRoi; }

function tripDateLabel(trip) {
  function part(iso) {
    var d = new Date(iso + 'T12:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { day: 'numeric', month: 'short' });
  }
  var year = String(trip.end || '').slice(0, 4);
  return part(trip.start) + (trip.end !== trip.start ? ' – ' + part(trip.end) : '') + (year ? ', ' + year : '');
}

function tripCostRowHtml(e) {
  var T = trueRoi();
  var cat = T.categoryById(e.category) || T.categoryById('other');
  var pending = !T.expensePhp(e).converted;
  return '<li class="trip-cost' + (pending ? ' needs-rate' : '') + '"><span class="trip-cost-what"><span aria-hidden="true">' + cat.icon + '</span> ' + esc(e.description || cat.label) +
    '<span class="trip-cost-meta"> · ' + esc(cat.label) + ' · ' + esc(e.date) + '</span></span>' +
    '<span class="trip-cost-amount">' + esc(T.describeExpense(e)) + '</span>' +
    '<span class="trip-cost-actions"><button class="del-btn" title="Edit cost" aria-label="Edit cost" onclick="editTripCost(' + e.id + ')">✎</button>' +
    '<button class="del-btn" title="Delete cost" aria-label="Delete cost" onclick="deleteTripCost(' + e.id + ')">✕</button></span></li>';
}

function roiBoxHtml(label, pct, kind) {
  var T = trueRoi();
  var tone = pct === null ? '' : pct > 0 ? ' pos' : pct < 0 ? ' neg' : '';
  return '<div class="roi-box ' + kind + tone + '"><div class="roi-box-label">' + label + '</div><div class="roi-box-value">' + esc(T.formatRoi(pct)) + '</div></div>';
}

function figureHtml(label, value, extra) {
  return '<div class="trip-fig' + (extra ? ' ' + extra : '') + '"><div class="trip-fig-label">' + label + '</div><div class="trip-fig-value">' + esc(value) + '</div></div>';
}

// The numbers for one trip (or for "not on a trip", or for everything).
function tripSummaryHtml(s) {
  var T = trueRoi();
  var html = '<div class="trip-roi">' + roiBoxHtml('Poker ROI', s.pokerRoi, 'poker') + '<span class="trip-roi-arrow" aria-hidden="true">→</span>' + roiBoxHtml('True ROI', s.trueRoi, 'true') + '</div>';
  html += '<div class="trip-figs">' +
    figureHtml('Won', T.formatPeso(s.returned)) +
    figureHtml('Buy-ins paid', T.formatPeso(s.cashBuyins)) +
    figureHtml('Satellites', T.formatPeso(s.satelliteSpend)) +
    figureHtml('Trip costs', T.formatPeso(s.expenses)) +
    figureHtml('Net after everything', T.formatPeso(s.truePnl), s.truePnl > 0 ? 'pos' : s.truePnl < 0 ? 'neg' : '') + '</div>';
  if (s.byCategory.length) {
    html += '<div class="trip-cats">' + s.byCategory.map(function(c) { return '<span class="lm-chip"><span aria-hidden="true">' + c.icon + '</span> ' + esc(c.label) + ' ' + esc(T.formatPeso(c.php)) + '</span>'; }).join('') + '</div>';
  }
  if (!s.sessions && s.expenseCount) html += '<div class="trip-hint">No sessions on this trip yet. True ROI shows up once you log some.</div>';
  s.warnings.forEach(function(w) { html += '<div class="trip-warn">⚠ ' + esc(w.text) + '</div>'; });
  return html;
}

function tripCardHtml(item, costs) {
  var t = item.trip, s = item.summary;
  var mine = costs.filter(function(e) { return String(e.tripId) === String(t.id); }).sort(function(a, b) { return String(b.date).localeCompare(String(a.date)) || (b.id - a.id); });
  return '<article class="trip-card" data-trip="' + t.id + '"><header class="trip-head"><div><h3 class="trip-name">' + esc(t.name) + '</h3>' +
    '<div class="trip-sub">' + esc(tripDateLabel(t)) + ' · ' + s.sessions + ' session' + (s.sessions === 1 ? '' : 's') + (s.satellites ? ' · ' + s.satellites + ' satellite' + (s.satellites === 1 ? '' : 's') : '') + '</div>' +
    (t.notes ? '<div class="trip-notes">' + esc(t.notes) + '</div>' : '') + '</div>' +
    '<div class="trip-head-actions"><button class="sec-action primary" onclick="openNewTripCostModal(' + t.id + ')">+ ADD COST</button>' +
    '<button class="sec-action" onclick="editTrip(' + t.id + ')">EDIT</button>' +
    '<button class="del-btn" title="Delete trip" aria-label="Delete trip ' + esc(t.name) + '" onclick="deleteTrip(' + t.id + ')">✕</button></div></header>' +
    tripSummaryHtml(s) +
    (mine.length ? '<ul class="trip-costs">' + mine.map(tripCostRowHtml).join('') + '</ul>' : '<div class="trip-empty">No costs yet. Add flights, hotel, food and the rest to see your true ROI for this trip.</div>') +
    '</article>';
}

function renderTrips() {
  var list = document.getElementById('trips-list');
  var overallEl = document.getElementById('trips-overall');
  var T = trueRoi();
  if (!list || !T) return;
  var part = T.partition({ trips: window.trips || [], sessions: window.sessions || [], satellites: window.satellites || [], expenses: window.tripExpenses || [] });
  var o = part.overall;
  if (overallEl) {
    overallEl.innerHTML = (o.sessions || o.satellites || o.expenseCount)
      ? '<div class="trip-card overall"><header class="trip-head"><div><h3 class="trip-name">All your play</h3><div class="trip-sub">' + o.sessions + ' session' + (o.sessions === 1 ? '' : 's') + ' · everything you have logged</div></div></header>' + tripSummaryHtml(o) + '</div>'
      : '';
  }
  var costs = window.tripExpenses || [];
  var html = part.trips.map(function(item) { return tripCardHtml(item, costs); }).join('');
  var u = part.unassigned;
  if (u.sessions || u.satellites || u.expenseCount) {
    html += '<article class="trip-card loose"><header class="trip-head"><div><h3 class="trip-name">Not on a trip</h3><div class="trip-sub">' + u.sessions + ' session' + (u.sessions === 1 ? '' : 's') + (u.satellites ? ' · ' + u.satellites + ' satellite' + (u.satellites === 1 ? '' : 's') : '') + ' outside every trip' + (u.expenseCount ? ' · ' + u.expenseCount + ' cost' + (u.expenseCount === 1 ? '' : 's') + ' whose trip was deleted' : '') + '</div></div></header>' + tripSummaryHtml(u) +
      (u.expenseCount ? '<ul class="trip-costs">' + costs.filter(function(e) { return !(window.trips || []).some(function(t) { return String(t.id) === String(e.tripId); }); }).map(tripCostRowHtml).join('') + '</ul>' : '') + '</article>';
  }
  if (!part.trips.length) {
    html = '<div class="trip-empty big">No trips yet. Add one for each away series or festival (dates and a name), then add its costs. Sessions and satellites inside the dates join it automatically.</div>' + html;
  }
  list.innerHTML = html;
  populateTripSelects();
}

// ── trip pop-up ──
function openNewTripModal() {
  _editingTripId = null;
  document.getElementById('modal-trip-title').textContent = 'New Trip';
  ['trip-name', 'trip-start', 'trip-end', 'trip-notes'].forEach(function(id) { document.getElementById(id).value = ''; });
  document.getElementById('trip-error').style.display = 'none';
  openModal('modal-trip');
}

function editTrip(id) {
  var t = (window.trips || []).filter(function(x) { return x.id === id; })[0];
  if (!t) return;
  _editingTripId = id;
  document.getElementById('modal-trip-title').textContent = 'Edit Trip';
  document.getElementById('trip-name').value = t.name || '';
  document.getElementById('trip-start').value = t.start || '';
  document.getElementById('trip-end').value = t.end || '';
  document.getElementById('trip-notes').value = t.notes || '';
  document.getElementById('trip-error').style.display = 'none';
  openModal('modal-trip');
}

function saveTrip() {
  var T = trueRoi();
  var existing = _editingTripId ? (window.trips || []).filter(function(x) { return x.id === _editingTripId; })[0] : null;
  var r = T.normalizeTrip({
    id: existing ? existing.id : Date.now(),
    name: document.getElementById('trip-name').value,
    start: document.getElementById('trip-start').value,
    end: document.getElementById('trip-end').value,
    notes: document.getElementById('trip-notes').value,
    rates: existing ? existing.rates : {}
  });
  var err = document.getElementById('trip-error');
  if (!r.ok) { err.textContent = r.message; err.style.display = ''; return; }
  err.style.display = 'none';
  if (existing) Object.assign(existing, r.trip);
  else window.trips.unshift(r.trip);
  trips = window.trips;
  save('trips', window.trips);
  closeModal('modal-trip');
  _editingTripId = null;
  renderTrips();
  if (typeof refreshInbox === 'function') refreshInbox();
}

function deleteTrip(id) {
  var idx = (window.trips || []).findIndex(function(x) { return x.id === id; });
  if (idx === -1) return;
  var removedTrip = window.trips[idx];
  var removedCosts = (window.tripExpenses || []).filter(function(e) { return String(e.tripId) === String(id); });
  if (removedCosts.length && !confirm('Delete "' + removedTrip.name + '" and its ' + removedCosts.length + ' cost' + (removedCosts.length === 1 ? '' : 's') + '?')) return;
  window.trips = window.trips.filter(function(x) { return x.id !== id; });
  window.tripExpenses = (window.tripExpenses || []).filter(function(e) { return String(e.tripId) !== String(id); });
  trips = window.trips; tripExpenses = window.tripExpenses;
  save('trips', window.trips);
  save('tripExpenses', window.tripExpenses);
  renderTrips();
  if (typeof showUndoToast === 'function') showUndoToast('Trip deleted: ' + removedTrip.name, function() {
    window.trips.splice(Math.min(idx, window.trips.length), 0, removedTrip);
    window.tripExpenses = window.tripExpenses.concat(removedCosts);
    trips = window.trips; tripExpenses = window.tripExpenses;
    save('trips', window.trips);
    save('tripExpenses', window.tripExpenses);
    renderTrips();
  }, 8000);
}

// ── cost pop-up ──
function fillCostRate() {
  var T = trueRoi();
  var cur = document.getElementById('cost-currency').value;
  var rateWrap = document.getElementById('cost-rate-wrap');
  var rateEl = document.getElementById('cost-rate');
  var trip = (window.trips || []).filter(function(t) { return String(t.id) === String(_costTripId); })[0];
  var foreign = cur !== 'PHP';
  rateWrap.style.display = foreign ? '' : 'none';
  document.getElementById('cost-rate-label').textContent = foreign ? 'Pesos per 1 ' + cur : 'Rate';
  if (foreign && !rateEl.value) {
    var suggested = T.defaultRate(trip, cur, window.trips);
    if (suggested) rateEl.value = suggested;
  }
  updateCostPreview();
}

function updateCostPreview() {
  var T = trueRoi();
  var el = document.getElementById('cost-preview');
  var amount = parseFloat(document.getElementById('cost-amount').value);
  var cur = document.getElementById('cost-currency').value;
  var rate = parseFloat(document.getElementById('cost-rate').value);
  if (!(amount > 0)) { el.textContent = ''; return; }
  var v = T.expensePhp({ amount: amount, currency: cur, rate: rate });
  el.textContent = v.converted ? (cur === 'PHP' ? '' : '= ' + T.formatPeso(v.php)) : 'Enter the exchange rate to count this cost.';
}

function fillCostForm(c) {
  document.getElementById('cost-date').value = c.date || todayLocal();
  document.getElementById('cost-category').value = c.category || 'other';
  document.getElementById('cost-desc').value = c.description || '';
  document.getElementById('cost-amount').value = c.amount || '';
  document.getElementById('cost-currency').value = c.currency || 'PHP';
  document.getElementById('cost-rate').value = c.rate || '';
  document.getElementById('cost-error').style.display = 'none';
  fillCostRate();
}

function openNewTripCostModal(tripId) {
  var trip = (window.trips || []).filter(function(t) { return t.id === tripId; })[0];
  if (!trip) return;
  _editingCostId = null;
  _costTripId = tripId;
  document.getElementById('modal-cost-title').textContent = 'Add a cost: ' + trip.name;
  var today = todayLocal();
  fillCostForm({ date: (today >= trip.start && today <= trip.end) ? today : trip.start, category: 'hotel', currency: 'PHP' });
  openModal('modal-trip-cost');
}

function editTripCost(id) {
  var c = (window.tripExpenses || []).filter(function(e) { return e.id === id; })[0];
  if (!c) return;
  var trip = (window.trips || []).filter(function(t) { return String(t.id) === String(c.tripId); })[0];
  _editingCostId = id;
  _costTripId = c.tripId;
  document.getElementById('modal-cost-title').textContent = 'Edit cost' + (trip ? ': ' + trip.name : '');
  fillCostForm(c);
  openModal('modal-trip-cost');
}

function saveTripCost() {
  var T = trueRoi();
  var r = T.normalizeExpense({
    id: _editingCostId || Date.now(),
    tripId: _costTripId,
    date: document.getElementById('cost-date').value,
    category: document.getElementById('cost-category').value,
    description: document.getElementById('cost-desc').value,
    amount: document.getElementById('cost-amount').value,
    currency: document.getElementById('cost-currency').value,
    rate: document.getElementById('cost-rate').value
  });
  var err = document.getElementById('cost-error');
  if (!r.ok) { err.textContent = r.message; err.style.display = ''; return; }
  err.style.display = 'none';
  var list = window.tripExpenses;
  var existing = _editingCostId ? list.filter(function(e) { return e.id === _editingCostId; })[0] : null;
  if (existing) { Object.keys(existing).forEach(function(k) { delete existing[k]; }); Object.assign(existing, r.expense); }
  else list.unshift(r.expense);
  tripExpenses = window.tripExpenses;
  save('tripExpenses', list);
  // the rate used becomes the trip's default for the next cost in that currency
  if (r.expense.currency !== 'PHP') {
    var trip = (window.trips || []).filter(function(t) { return String(t.id) === String(r.expense.tripId); })[0];
    if (trip) { trip.rates = trip.rates || {}; trip.rates[r.expense.currency] = r.expense.rate; save('trips', window.trips); }
  }
  closeModal('modal-trip-cost');
  _editingCostId = null;
  renderTrips();
}

function deleteTripCost(id) {
  var idx = (window.tripExpenses || []).findIndex(function(e) { return e.id === id; });
  if (idx === -1) return;
  var removed = window.tripExpenses[idx];
  window.tripExpenses = window.tripExpenses.filter(function(e) { return e.id !== id; });
  tripExpenses = window.tripExpenses;
  save('tripExpenses', window.tripExpenses);
  renderTrips();
  if (typeof showUndoToast === 'function') showUndoToast('Cost deleted: ' + (removed.description || trueRoi().categoryById(removed.category).label), function() {
    window.tripExpenses.splice(Math.min(idx, window.tripExpenses.length), 0, removed);
    tripExpenses = window.tripExpenses;
    save('tripExpenses', window.tripExpenses);
    renderTrips();
  });
}

// ── the trip and satellite-seat fields on the session and satellite forms ──
function tripOptionsHtml(selected) {
  var list = (window.trips || []).slice().sort(function(a, b) { return String(b.start).localeCompare(String(a.start)); });
  var html = '<option value=""' + (!selected ? ' selected' : '') + '>Automatic (by date)</option><option value="none"' + (selected === 'none' ? ' selected' : '') + '>Not on a trip</option>';
  list.forEach(function(t) { html += '<option value="' + t.id + '"' + (String(t.id) === String(selected) ? ' selected' : '') + '>' + esc(t.name) + ' (' + esc(tripDateLabel(t)) + ')</option>'; });
  return html;
}

function populateTripSelects() {
  ['s-trip', 'sat-trip'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var keep = el.value;
    el.innerHTML = tripOptionsHtml(keep);
    if (Array.prototype.some.call(el.options, function(o) { return o.value === keep; })) el.value = keep; else el.value = '';
  });
}

function loadSessionTripFields(s) {
  populateTripSelects();
  var sel = document.getElementById('s-trip');
  if (sel) sel.value = s && s.tripId !== undefined && s.tripId !== null ? String(s.tripId) : '';
  var seat = document.getElementById('s-satseat');
  if (seat) seat.checked = !!(s && s.seatViaSatellite === true);
}

function resetSessionTripFields() { loadSessionTripFields(null); }

// Writes the form's trip / satellite-seat choice onto a session record (adds or removes the fields).
function applySessionTripFields(s) {
  var sel = document.getElementById('s-trip');
  var seat = document.getElementById('s-satseat');
  var tripValue = sel ? sel.value : '';
  if (tripValue === '') delete s.tripId;
  else if (tripValue === 'none') s.tripId = 'none';
  else s.tripId = Number(tripValue) || tripValue;
  if (seat && seat.checked) s.seatViaSatellite = true; else delete s.seatViaSatellite;
}

function loadSatelliteTripField(sat) {
  populateTripSelects();
  var sel = document.getElementById('sat-trip');
  if (sel) sel.value = sat && sat.tripId !== undefined && sat.tripId !== null ? String(sat.tripId) : '';
}

function applySatelliteTripField(sat) {
  var sel = document.getElementById('sat-trip');
  var v = sel ? sel.value : '';
  if (v === '') delete sat.tripId;
  else if (v === 'none') sat.tripId = 'none';
  else sat.tripId = Number(v) || v;
}
