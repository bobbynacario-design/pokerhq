// Event Poster Import: choose a photo of a tournament poster, Claude reads it, and you confirm each
// event before anything reaches the calendar. The rules and the request live in js/data/poster.js
// (window.PokerHQPoster); this file is the pop-up, the photo handling and the confirmation cards.
// The picture is sent to Claude to be read (through the same Anthropic access the other AI features use:
// a key on this device, or the owner's server proxy) and is not saved anywhere.

var _poster = { file: null, previewUrl: '', drafts: [], notes: '', busy: false, run: 0 };

function posterLib() { return window.PokerHQPoster; }

function posterEl(id) { return document.getElementById(id); }

function posterShowStage(stage) {
  ['pick', 'reading', 'confirm'].forEach(function(s) { posterEl('poster-stage-' + s).style.display = s === stage ? '' : 'none'; });
  var title = { pick: 'Import events from a poster', reading: 'Reading the poster…', confirm: 'Check the events' }[stage];
  posterEl('modal-poster-title').textContent = title;
}

function posterError(message) {
  var el = posterEl('poster-error');
  el.textContent = message || '';
  el.style.display = message ? '' : 'none';
}

function posterReleasePreview() {
  if (_poster.previewUrl) { try { URL.revokeObjectURL(_poster.previewUrl); } catch (e) {} }
  _poster.previewUrl = '';
}

function openPosterImport() {
  _poster.run++;
  posterReleasePreview();
  _poster = { file: null, previewUrl: '', drafts: [], notes: '', busy: false, run: _poster.run };
  posterEl('poster-file').value = '';
  posterEl('poster-hint').value = '';
  var img = posterEl('poster-preview');
  img.removeAttribute('src');
  img.style.display = 'none';
  posterEl('poster-file-name').textContent = 'No photo chosen yet';
  posterEl('poster-read-btn').disabled = true;
  posterShowStage('pick');
  posterError(hasAnthropicAccess() ? '' : 'Reading a poster needs Claude. Add your Anthropic API key in AI Assistant, or sign in with the owner account for keyless access.');
  openModal('modal-poster');
}

function closePosterImport() {
  _poster.run++;      // an answer that arrives after this is ignored
  posterReleasePreview();
  closeModal('modal-poster');
}

function posterChooseFile(input) {
  var file = input && input.files && input.files[0];
  posterError(hasAnthropicAccess() ? '' : posterEl('poster-error').textContent);
  if (!file) return;
  if (!/^image\//.test(file.type || '')) { posterError('That file is not a picture. Choose a photo or a screenshot of the poster.'); posterEl('poster-read-btn').disabled = true; return; }
  if (file.size > 30 * 1024 * 1024) { posterError('That picture is very large (over 30 MB). Take a normal photo or a screenshot instead.'); posterEl('poster-read-btn').disabled = true; return; }
  posterReleasePreview();
  _poster.file = file;
  _poster.previewUrl = URL.createObjectURL(file);
  var img = posterEl('poster-preview');
  img.src = _poster.previewUrl;
  img.style.display = '';
  posterEl('poster-file-name').textContent = file.name || 'Photo chosen';
  posterEl('poster-read-btn').disabled = !hasAnthropicAccess();
}

// Decode the photo (upright, whatever way the phone held it), shrink it to Claude's useful size and
// re-encode as JPEG. Returns {base64, mediaType, width, height, bytes}.
async function posterPrepareImage(file) {
  var P = posterLib();
  var bitmap = null;
  try {
    if (typeof createImageBitmap === 'function') bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) { bitmap = null; }
  var source = bitmap;
  var objectUrl = '';
  if (!source) {
    objectUrl = URL.createObjectURL(file);
    source = await new Promise(function(resolve, reject) {
      var image = new Image();
      image.onload = function() { resolve(image); };
      image.onerror = function() { reject(new Error('decode')); };
      image.src = objectUrl;
    });
  }
  var srcW = source.width || source.naturalWidth, srcH = source.height || source.naturalHeight;
  var size = P.fitSize(srcW, srcH);
  var canvas = document.createElement('canvas');
  canvas.width = size.width; canvas.height = size.height;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';          // a transparent PNG becomes white, not black, in a JPEG
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(source, 0, 0, size.width, size.height);
  if (bitmap && bitmap.close) bitmap.close();
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  var blob = null;
  var qualities = [0.86, 0.72, 0.55];
  for (var i = 0; i < qualities.length; i++) {
    blob = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/jpeg', qualities[i]); });
    if (blob && blob.size <= P.MAX_IMAGE_BYTES) break;
  }
  if (!blob || blob.size > P.MAX_IMAGE_BYTES) throw new Error('too-big');
  return { base64: await blobToBase64(blob), mediaType: 'image/jpeg', width: size.width, height: size.height, bytes: blob.size };
}

function posterDefaultRate(code) {
  var T = window.PokerHQTrueRoi;
  return T ? T.defaultRate(null, code, window.trips || []) : null;
}

function posterDraftContext() {
  return {
    today: todayLocal(),
    rateFor: posterDefaultRate,
    existing: window.tourneys || [],
    fingerprint: typeof getImportedTourneyFingerprint === 'function' ? getImportedTourneyFingerprint : function(t) { return [(t.date || ''), (t.name || ''), (t.venue || '')].join('|').toLowerCase(); }
  };
}

async function readPoster() {
  var P = posterLib();
  if (!_poster.file || _poster.busy) return;
  if (!hasAnthropicAccess()) { posterError('Reading a poster needs Claude. Add your Anthropic API key in AI Assistant, or sign in with the owner account.'); return; }
  var run = ++_poster.run;
  _poster.busy = true;
  posterError('');
  posterShowStage('reading');
  try {
    var image;
    try { image = await posterPrepareImage(_poster.file); }
    catch (e) { throw new Error(e && e.message === 'too-big' ? 'That picture is too big to send even after shrinking it. Crop it to the schedule and try again.' : 'Could not open that picture. Try a JPEG or PNG, or take a screenshot of the poster.'); }
    var request = P.buildRequest(image, todayLocal(), posterEl('poster-hint').value);
    var response = await callAnthropicMessages(request, { timeoutMs: 90000 });
    if (run !== _poster.run) return;
    if (!response.ok) {
      if (response.status === 401) throw new Error('Claude rejected the API key (401). Check it in AI Assistant.');
      throw new Error(await getAnthropicErrorMessage(response, 'Claude could not read the poster'));
    }
    var data = await response.json();
    var text = (data.content || []).map(function(c) { return c.text || ''; }).join('');
    var parsed = P.parseResponse(text);
    if (!parsed.ok) throw new Error(parsed.message);
    _poster.drafts = P.buildDrafts(parsed.events, posterDraftContext());
    _poster.notes = (parsed.notes || '') + (parsed.truncated ? ' The answer was cut off, so some events at the end may be missing.' : '');
    renderPosterDrafts();
    posterShowStage('confirm');
  } catch (err) {
    if (run !== _poster.run) return;
    posterShowStage('pick');
    posterError((err && err.message) || 'Something went wrong reading the poster. Try again.');
  } finally {
    if (run === _poster.run) _poster.busy = false;
  }
}

// ── the confirmation cards ──
function posterOptions(list, current) {
  return list.map(function(v) { return '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
}

function posterIsFlagged(d, field) {
  return d.uncertain.indexOf(field) !== -1 || d.blocking.some(function(b) { return b.field === field; }) ||
    (field === 'endDate' && d.warnings.some(function(w) { return w.field === 'endDate'; }));
}

function posterFieldClass(d, field) {
  return posterIsFlagged(d, field) ? ' flagged' : '';
}

function posterIssuesHtml(d) {
  return d.blocking.map(function(b) { return '<div class="poster-issue block">✖ ' + esc(b.text) + '</div>'; }).join('') +
    d.warnings.map(function(w) { return '<div class="poster-issue">⚠ ' + esc(w.text) + '</div>'; }).join('');
}

function posterPesoText(d) {
  var P = posterLib();
  if (d.currency === 'PHP' || !(d.buyin > 0)) return '';
  var pesos = P.buyinInPesos(d);
  return pesos ? '= ' + window.PokerHQTrueRoi.formatPeso(pesos) : '';
}

function posterBadgeHtml(d) {
  if (d.duplicate) return '<span class="poster-badge dup">Already on your calendar' + (d.duplicateOf && d.duplicateOf.name ? ': ' + esc(d.duplicateOf.name) : '') + '</span>';
  if (d.updates) return '<span class="poster-badge upd">Updates the one-day entry already on your calendar</span>';
  return '';
}

function posterCardHtml(d) {
  var P = posterLib();
  var i = d.index;
  var currencies = P.CURRENCY_CODES.map(function(c) { return '<option value="' + c + '"' + (c === d.currency ? ' selected' : '') + '>' + c + '</option>'; }).join('');
  var foreign = d.currency !== 'PHP';
  var dupBadge = '<span class="poster-badge-slot">' + posterBadgeHtml(d) + '</span>';
  return '<article class="poster-card' + (d.include ? ' on' : '') + (d.ready ? '' : ' blocked') + (d.duplicate ? ' dup' : '') + '" data-i="' + i + '">' +
    '<div class="poster-card-top"><label class="check-row poster-include"><input type="checkbox" ' + (d.include ? 'checked ' : '') + (d.ready ? '' : 'disabled ') + 'onchange="posterToggle(' + i + ', this.checked)" aria-label="Add this event"> <span>' + (d.ready ? 'Add this event' : 'Fix the marked fields to add it') + '</span></label>' + dupBadge + '</div>' +
    '<div class="poster-grid">' +
      '<label data-field="name" class="poster-f wide' + posterFieldClass(d, 'name') + '"><span>Name</span><input class="form-input" type="text" maxlength="100" value="' + esc(d.name) + '" oninput="posterEdit(' + i + ', \'name\', this.value)"></label>' +
      '<label data-field="date" class="poster-f' + posterFieldClass(d, 'date') + '"><span>Date</span><input class="form-input" type="date" value="' + esc(d.date) + '" oninput="posterEdit(' + i + ', \'date\', this.value)"></label>' +
      '<label data-field="endDate" class="poster-f' + posterFieldClass(d, 'endDate') + '"><span>Last day</span><input class="form-input" type="date" title="Only if the event runs more than one day" value="' + esc(d.endDate) + '" oninput="posterEdit(' + i + ', \'endDate\', this.value)"></label>' +
      '<label data-field="venue" class="poster-f wide' + posterFieldClass(d, 'venue') + '"><span>Venue</span><input class="form-input" type="text" maxlength="100" value="' + esc(d.venue) + '" oninput="posterEdit(' + i + ', \'venue\', this.value)"></label>' +
      '<label data-field="time" class="poster-f' + posterFieldClass(d, 'time') + '"><span>Start time</span><input class="form-input" type="time" value="' + esc(d.time) + '" oninput="posterEdit(' + i + ', \'time\', this.value)"></label>' +
      '<label data-field="buyin" class="poster-f' + posterFieldClass(d, 'buyin') + '"><span>Buy-in</span><input class="form-input" type="number" data-money min="0" step="any" value="' + (d.buyin || '') + '" placeholder="0" oninput="posterEdit(' + i + ', \'buyin\', this.value)"></label>' +
      '<label class="poster-f"><span>Currency</span><select class="form-input" onchange="posterEdit(' + i + ', \'currency\', this.value, true)">' + currencies + '</select></label>' +
      (foreign ? '<label data-field="rate" class="poster-f' + (posterIsFlagged(d, 'rate') ? ' flagged' : '') + '"><span>Pesos per 1 ' + esc(d.currency) + '</span><input class="form-input" type="number" min="0" step="any" value="' + (d.rate || '') + '" placeholder="rate" oninput="posterEdit(' + i + ', \'rate\', this.value)"></label>' : '') +
      '<div class="poster-f poster-peso" aria-live="polite">' + esc(posterPesoText(d)) + '</div>' +
      '<label data-field="gtd" class="poster-f' + posterFieldClass(d, 'gtd') + '"><span>Guarantee</span><input class="form-input" type="text" maxlength="40" value="' + esc(d.gtd) + '" oninput="posterEdit(' + i + ', \'gtd\', this.value)"></label>' +
      '<label data-field="structure" class="poster-f' + posterFieldClass(d, 'structure') + '"><span>Format</span><select class="form-input" onchange="posterEdit(' + i + ', \'structure\', this.value)">' + posterOptions(P.STRUCTURES, d.structure) + '</select></label>' +
      '<label data-field="category" class="poster-f' + posterFieldClass(d, 'category') + '"><span>Type</span><select class="form-input" onchange="posterEdit(' + i + ', \'category\', this.value)">' + posterOptions(P.CATEGORIES, d.category) + '</select></label>' +
      '<label class="poster-f wide"><span>Notes</span><input class="form-input" type="text" maxlength="160" value="' + esc(d.notes) + '" oninput="posterEdit(' + i + ', \'notes\', this.value)"></label>' +
    '</div>' + (d.printedDates ? '<div class="poster-says">Poster says: <q>' + esc(d.printedDates) + '</q></div>' : '') +
    '<div class="poster-issues">' + posterIssuesHtml(d) + '</div></article>';
}

function renderPosterSummary() {
  var P = posterLib();
  var s = P.summary(_poster.drafts);
  var line = 'Found ' + s.found + ' event' + (s.found === 1 ? '' : 's') + '.';
  var bits = [];
  if (s.blocked) bits.push(s.blocked + ' need' + (s.blocked === 1 ? 's' : '') + ' a fix before ' + (s.blocked === 1 ? 'it' : 'they') + ' can be added');
  if (s.duplicates) bits.push(s.duplicates + ' already on your calendar');
  if (s.updates) bits.push(s.updates + ' will update ' + (s.updates === 1 ? 'an entry' : 'entries') + ' you already have');
  if (s.withWarnings) bits.push(s.withWarnings + ' to double-check');
  posterEl('poster-summary').textContent = line + (bits.length ? ' ' + bits.join(', ') + '.' : ' All look ready.');
  posterEl('poster-notes').textContent = _poster.notes || '';
  posterEl('poster-notes').style.display = _poster.notes ? '' : 'none';
  var btn = posterEl('poster-add-btn');
  btn.disabled = !s.canAdd;
  var adds = s.chosen - s.updates;
  btn.textContent = !s.chosen ? 'NOTHING TICKED'
    : !s.updates ? 'ADD ' + s.chosen + ' TO CALENDAR ↗'
    : !adds ? 'UPDATE ' + s.updates + ' ON CALENDAR ↗'
    : 'ADD ' + adds + ' · UPDATE ' + s.updates + ' ↗';
}

function renderPosterDrafts() {
  posterEl('poster-drafts').innerHTML = _poster.drafts.map(posterCardHtml).join('');
  renderPosterSummary();
}

function posterToggle(i, on) {
  var d = _poster.drafts[i];
  if (!d) return;
  d.include = !!on && d.ready;
  var card = document.querySelector('.poster-card[data-i="' + i + '"]');
  if (card) card.classList.toggle('on', d.include);
  renderPosterSummary();
}

// Typing updates the draft and re-checks it without redrawing the card (that would drop the cursor);
// changing the currency redraws it because the rate box appears or goes.
function posterEdit(i, field, value, redraw) {
  var P = posterLib();
  var d = _poster.drafts[i];
  if (!d) return;
  if (field === 'buyin') d.buyin = Math.max(0, parseFloat(value) || 0);
  else if (field === 'rate') d.rate = parseFloat(value) > 0 ? parseFloat(value) : null;
  else if (field === 'currency') {
    // remember the rate typed for each currency so flipping to pesos and back doesn't lose it
    d.rateMemory = d.rateMemory || {};
    if (d.currency !== 'PHP' && d.rate) d.rateMemory[d.currency] = d.rate;
    d.currency = value;
    d.rate = value === 'PHP' ? null : (d.rateMemory[value] || posterDefaultRate(value));
  }
  else if (field === 'time') d.time = P.normalizeTime(value);
  else if (field === 'date') { d.date = value; d.movedFrom = null; d.autoFixes = (d.autoFixes || []).filter(function(w) { return w.field !== 'date'; }); }
  else if (field === 'endDate') { d.endDate = value; d.autoFixes = (d.autoFixes || []).filter(function(w) { return w.field !== 'endDate'; }); }
  else d[field] = value;
  if (field === 'date' || field === 'endDate' || field === 'name' || field === 'venue') {
    var wasDup = d.duplicate;
    P.markDuplicates(_poster.drafts, window.tourneys || [], posterDraftContext().fingerprint);
    if (d.duplicate && !wasDup) d.include = false;
  }
  // an edited field is no longer in doubt
  if (d.uncertain.indexOf(field) !== -1 && field !== 'date') d.uncertain = d.uncertain.filter(function(f) { return f !== field; });
  if (field === 'date' && d.date) d.uncertain = d.uncertain.filter(function(f) { return f !== 'date'; });
  P.revalidate(d, { today: todayLocal() });
  if (!d.ready) d.include = false;
  var card = document.querySelector('.poster-card[data-i="' + i + '"]');
  if (redraw || !card) { renderPosterDrafts(); return; }
  card.classList.toggle('blocked', !d.ready);
  card.classList.toggle('dup', d.duplicate);
  card.querySelector('.poster-badge-slot').innerHTML = posterBadgeHtml(d);
  card.querySelector('.poster-issues').innerHTML = posterIssuesHtml(d);
  card.querySelector('.poster-peso').textContent = posterPesoText(d);
  var box = card.querySelector('.poster-include input');
  box.disabled = !d.ready;
  box.checked = d.include;
  card.querySelector('.poster-include span').textContent = d.ready ? 'Add this event' : 'Fix the marked fields to add it';
  card.classList.toggle('on', d.include);
  card.querySelectorAll('[data-field]').forEach(function(el) { el.classList.toggle('flagged', posterIsFlagged(d, el.getAttribute('data-field'))); });
  renderPosterSummary();
}

function posterBack() {
  posterError('');
  posterShowStage('pick');
}

function addPosterEvents() {
  var P = posterLib();
  var s = P.summary(_poster.drafts);
  if (!s.canAdd) return;
  var chosen = _poster.drafts.filter(function(d) { return d.include; });
  // an event already saved as one day gets its last day; the entry is changed in place, not added again
  var before = [], updated = [];
  chosen.filter(function(d) { return d.updates; }).forEach(function(d) {
    var t = (window.tourneys || []).find(function(x) { return x.id === d.updates.id; });
    if (!t) { d.updates = null; return; }
    before.push({ id: t.id, date: t.date, time: t.time });
    t.date = P.storedDate(d);
    if (!t.time && /^\d{2}:\d{2}$/.test(d.time || '')) t.time = d.time;
    updated.push(t);
  });
  var fresh = chosen.filter(function(d) { return !d.updates; });
  var added = fresh.length ? importCalendarUpdateEvents(fresh.map(P.toImportEvent)) : [];
  if (updated.length) {
    tourneys = window.tourneys;
    tourneys.sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    save('tourneys', tourneys);
  }
  var skipped = fresh.length - added.length;
  var touched = added.concat(updated);
  closePosterImport();
  if (touched.length) {
    // Show the month of the first event you can still catch: an event that is running today counts as today, one that
    // starts later as its first day. Only if everything is already over, the latest of those.
    var todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
    var spans = touched.map(function(t) { var r = parseTourneyDateRange(t); return r && r.start ? { start: r.start, end: r.end || r.start } : null; }).filter(Boolean);
    var live = spans.filter(function(r) { return r.end >= todayMid; }).map(function(r) { return r.start < todayMid ? todayMid : r.start; });
    var shownDate = live.length
      ? live.reduce(function(a, b) { return b < a ? b : a; })
      : (spans.length ? spans.reduce(function(a, b) { return b.start > a.start ? b : a; }).start : null);
    if (shownDate && typeof calYear !== 'undefined') { calYear = shownDate.getFullYear(); calMonth = shownDate.getMonth(); }
    if (typeof renderCalendar === 'function') renderCalendar();
  }
  var ids = added.map(function(t) { return t.id; });
  var shown = '';
  if (touched.length && typeof calYear !== 'undefined') {
    var now = new Date();
    if (calYear !== now.getFullYear() || calMonth !== now.getMonth()) {
      shown = ' · showing ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][calMonth] + ' ' + calYear;
    }
  }
  var parts = [];
  if (added.length) parts.push('Added ' + added.length + ' event' + (added.length === 1 ? '' : 's'));
  if (updated.length) parts.push((added.length ? 'updated ' : 'Updated ') + updated.length + ' already on your calendar');
  var label = touched.length
    ? parts.join(' and ') + ' from the poster' + (skipped ? ' (' + skipped + ' already there)' : '') + shown
    : 'Nothing added: ' + (skipped === 1 ? 'that event is' : 'those events are') + ' already on your calendar';
  if (typeof showUndoToast === 'function') {
    showUndoToast(label, function() {
      window.tourneys = (window.tourneys || []).filter(function(t) { return ids.indexOf(t.id) === -1; });
      before.forEach(function(b) {
        var t = window.tourneys.find(function(x) { return x.id === b.id; });
        if (t) { t.date = b.date; t.time = b.time; }
      });
      tourneys = window.tourneys;
      save('tourneys', tourneys);
      renderCalendar();
    }, 8000);
  }
}
