"use strict";

// Event Poster Import: turn a photo of a tournament poster into calendar events. Claude reads the
// picture (vision) and answers with JSON; everything here is the part around that call, so it can be
// tested without an AI: the request, reading the answer safely, turning each event into an editable
// draft with flags for anything doubtful, spotting events that are already on the calendar, and turning
// a confirmed draft back into what the calendar importer takes. Pure logic, loaded as a classic script
// (window.PokerHQPoster) and importable from Node for tests/poster.test.js. The screens are
// js/features/poster-import.js.
//
// Nothing is added to the calendar until the player has seen and confirmed each event.
(function (root) {
  var MODEL = "claude-sonnet-4-6";     // must stay in functions/index.js ALLOWED_MODELS (tests/ai-config.test.js)
  var MAX_TOKENS = 6000;               // a festival schedule can list dozens of events
  var MAX_EVENTS = 60;
  var MAX_IMAGE_SIDE = 1568;           // Claude's recommended long side; larger only costs upload time
  var MAX_IMAGE_BYTES = 4 * 1024 * 1024;   // keeps the request well inside the 10 MB callable limit after base64
  var STRUCTURES = ["Freezeout", "Re-entry", "Turbo", "Deep Stack", "Bounty / PKO", "Satellite / Qualifier", "Regular"];
  var CATEGORIES = ["side", "main", "satellite"];
  var FIELDS = ["name", "date", "time", "venue", "buyin", "gtd", "structure", "category"];   // what the model may say it is unsure of

  var CURRENCY_CODES = ["PHP", "USD", "TWD", "THB", "VND", "SGD", "MYR", "HKD", "MOP", "KRW", "JPY", "EUR", "GBP", "AUD", "IDR", "CNY"];

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v, max) { return String(v === null || typeof v === "undefined" ? "" : v).replace(/\s+/g, " ").trim().slice(0, max); }
  function isDate(s) {
    var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
  }
  function daysBetween(a, b) {   // both YYYY-MM-DD: b - a in whole days
    var pa = a.split("-").map(Number), pb = b.split("-").map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
  }

  // ── the request ──
  // The answer schema: every property required and nothing extra, which is what structured output wants.
  var SCHEMA = {
    type: "object",
    properties: {
      events: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            date: { type: "string" },
            endDate: { type: "string" },
            time: { type: "string" },
            venue: { type: "string" },
            buyin: { type: "number" },
            currency: { type: "string" },
            gtd: { type: "string" },
            structure: { type: "string", enum: STRUCTURES },
            category: { type: "string", enum: CATEGORIES },
            notes: { type: "string" },
            uncertain: { type: "array", items: { type: "string", enum: FIELDS } }
          },
          required: ["name", "date", "endDate", "time", "venue", "buyin", "currency", "gtd", "structure", "category", "notes", "uncertain"],
          additionalProperties: false
        }
      },
      posterNotes: { type: "string" }
    },
    required: ["events", "posterNotes"],
    additionalProperties: false
  };

  // today: YYYY-MM-DD (so a poster without a year gets the next one that has not passed). hint: anything
  // the player typed, e.g. the venue when the poster only shows a logo.
  function buildPrompt(today, hint) {
    return "You are reading a photo or screenshot of a poker tournament poster or schedule so its events can be added to a tournament calendar. " +
      "Today's date is " + today + ".\n\n" +
      "Extract EVERY tournament the poster lists, each as its own event (a festival schedule with 12 events is 12 events). Copy what is printed; " +
      "never invent an event, date, time, buy-in or guarantee. If a value is not visible, leave it empty (or 0 for buy-in) and add the field name to \"uncertain\". " +
      "Also add a field to \"uncertain\" when the poster is blurry, cropped, ambiguous or you had to guess it.\n\n" +
      "RULES:\n" +
      "• date: one calendar date in strict YYYY-MM-DD form. For a multi-day event use its first day (Day 1A) and put its last day in endDate (else endDate is an empty string). " +
      "When the poster gives no year, use the next occurrence on or after today (" + today + ") and add \"date\" to \"uncertain\". Never output a weekday name, \"TBD\" or a range in date.\n" +
      "• time: 24-hour HH:MM start time (2PM is 14:00). Empty string if none is printed.\n" +
      "• buyin: a plain number in the currency printed on the poster, with no symbol or thousands separators. \"currency\" is its 3-letter code (PHP for pesos or ₱, USD for $, TWD for NT$, and so on). Use PHP if the poster shows no currency. Fees printed separately go in notes.\n" +
      "• gtd: the guarantee exactly as printed (e.g. \"₱1,000,000\", \"$50K\"), or an empty string.\n" +
      "• venue: the room or casino name as printed, or an empty string.\n" +
      "• category: \"satellite\" ONLY when the prize is a seat or package into another event (satellites, qualifiers, feeders, \"win a seat\"); \"main\" for the flagship Main Event of a series; \"side\" for every other tournament. A Day 1 flight of a Main, a deepstack, turbo, bounty or high roller that pays cash is NOT a satellite.\n" +
      "• structure: one of " + STRUCTURES.join(", ") + ". Use Regular when nothing more specific is printed.\n" +
      "• notes: brief useful details from the poster (late registration, re-entries, rake, contact), maximum 100 characters.\n" +
      "• Ignore anything that is not a scheduled tournament (cash games, promotions, hotel offers, sponsors) and say in posterNotes, in one short sentence, what you ignored or could not read.\n" +
      (hint ? "\nExtra context from the player: " + str(hint, 300) + "\n" : "") +
      "\nAnswer with JSON matching the schema and nothing else.";
  }

  // The Anthropic Messages request for one poster image. image: {base64, mediaType}.
  function buildRequest(image, today, hint) {
    return {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: image.mediaType || "image/jpeg", data: image.base64 } },
          { type: "text", text: buildPrompt(today, hint) }
        ]
      }]
    };
  }

  // ── reading the answer ──
  // Whole-JSON first; if it was cut off (or wrapped in prose / a code fence) recover the complete event objects.
  function recoverEvents(text) {
    var out = [];
    var at = text.indexOf('"events"');
    var start = at !== -1 ? text.indexOf("[", at) : text.indexOf("[");
    if (start === -1) return out;
    var i = start + 1, n = text.length;
    while (i < n) {
      while (i < n && text.charAt(i) !== "{" && text.charAt(i) !== "]") i++;
      if (i >= n || text.charAt(i) === "]") break;
      var depth = 0, inStr = false, escaped = false, objStart = i, j = i, done = false;
      for (; j < n; j++) {
        var ch = text.charAt(j);
        if (inStr) { if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inStr = false; }
        else if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) { j++; done = true; break; } }
      }
      if (!done) break;
      try { out.push(JSON.parse(text.substring(objStart, j))); } catch (e) { /* skip one unreadable object */ }
      i = j;
    }
    return out;
  }

  // Returns {ok, events, notes, truncated} or {ok:false, message}.
  function parseResponse(text) {
    var raw = String(text || "").trim();
    if (!raw) return { ok: false, message: "Claude sent back nothing. Try again." };
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    var events, notes = "", truncated = false;
    if (parsed && Array.isArray(parsed.events)) {
      events = parsed.events;
      notes = str(parsed.posterNotes, 300);
    } else {
      events = recoverEvents(raw);
      truncated = events.length > 0;
    }
    events = events.filter(function (e) { return e && typeof e === "object" && !Array.isArray(e); });
    if (!events.length) return { ok: false, message: "No tournaments were found on that poster. Try a clearer photo, or crop it to the schedule." };
    var capped = events.length > MAX_EVENTS;
    return { ok: true, events: events.slice(0, MAX_EVENTS), notes: notes + (capped ? " (Only the first " + MAX_EVENTS + " events are shown.)" : ""), truncated: truncated };
  }

  // ── time, money, dates ──
  // "2PM", "2:30 pm", "14:00", "1400", "12 NN" → "HH:MM", else "".
  function normalizeTime(v) {
    var s = String(v || "").trim().toLowerCase().replace(/\./g, "");
    if (!s) return "";
    if (/^\d{4}$/.test(s)) s = s.slice(0, 2) + ":" + s.slice(2);
    var m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|nn|noon|mn)?(?:\s*(?:onwards|start|sharp))?$/);
    if (!m) return "";
    var h = Number(m[1]), min = Number(m[2] || 0), ap = m[3] || "";
    if (min > 59) return "";
    if (ap === "nn" || ap === "noon") { if (h !== 12) return ""; }
    else if (ap === "mn") { if (h !== 12) return ""; h = 0; }
    else if (ap === "pm") { if (h < 1 || h > 12) return ""; if (h < 12) h += 12; }
    else if (ap === "am") { if (h < 1 || h > 12) return ""; if (h === 12) h = 0; }
    if (h > 23) return "";
    return (h < 10 ? "0" : "") + h + ":" + (min < 10 ? "0" : "") + min;
  }

  function parseAmount(v) {
    if (typeof v === "number") return isFinite(v) && v >= 0 ? v : 0;
    var s = String(v || "").replace(/[^\d.]/g, "");
    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  function currencyOf(v) {
    var c = String(v || "").trim().toUpperCase();
    if (!c || c === "₱" || c === "PESO" || c === "PESOS") return { code: "PHP", known: true };
    return CURRENCY_CODES.indexOf(c) !== -1 ? { code: c, known: true } : { code: "PHP", known: false };
  }

  function dayLabel(iso) {
    var d = new Date(iso + "T12:00:00");
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric" });
  }

  // ── one event as an editable draft ──
  // ctx: {today, rateFor(code) → number|null}. Blocking issues stop an event being added until fixed;
  // warnings are shown but don't. `uncertain` are the fields the model was not sure of.
  function normalizeEvent(raw, ctx) {
    var c = ctx || {};
    var r = raw && typeof raw === "object" ? raw : {};
    var cur = currencyOf(r.currency);
    var uncertain = arr(r.uncertain).filter(function (f) { return FIELDS.indexOf(f) !== -1; }).filter(function (f, i, a) { return a.indexOf(f) === i; });
    var d = {
      name: str(r.name, 100),
      date: isDate(String(r.date || "").trim()) ? String(r.date).trim() : "",
      endDate: isDate(String(r.endDate || "").trim()) ? String(r.endDate).trim() : "",
      time: normalizeTime(r.time),
      venue: str(r.venue, 100),
      buyin: parseAmount(r.buyin),
      currency: cur.code,
      rate: null,
      gtd: str(r.gtd, 40),
      structure: STRUCTURES.indexOf(r.structure) !== -1 ? r.structure : (String(r.category) === "satellite" ? "Satellite / Qualifier" : "Regular"),
      category: CATEGORIES.indexOf(r.category) !== -1 ? r.category : "side",
      notes: str(r.notes, 160),
      uncertain: uncertain
    };
    if (d.endDate && d.date && d.endDate <= d.date) d.endDate = "";
    if (d.currency !== "PHP" && typeof c.rateFor === "function") { var rate = num(c.rateFor(d.currency)); if (rate > 0) d.rate = rate; }
    if (!cur.known && String(r.currency || "").trim()) uncertain.push("buyin");
    d.duplicate = false;
    d.duplicateOf = null;
    return revalidate(d, c);
  }

  // Recomputes the issues and readiness of a draft (called again after every edit on the confirm screen).
  function revalidate(d, ctx) {
    var today = ctx && ctx.today;
    var blocking = [], warnings = [];
    if (!d.name) blocking.push({ field: "name", text: "Give it a name." });
    if (!d.date) blocking.push({ field: "date", text: "Pick the date. It wasn't clear on the poster." });
    if (d.currency !== "PHP" && d.buyin > 0 && !(num(d.rate) > 0)) blocking.push({ field: "rate", text: "Enter the exchange rate for " + d.currency + " to count the buy-in in pesos." });
    if (d.date && isDate(today) && daysBetween(d.date, today) > 30) warnings.push({ field: "date", text: "This date is more than a month ago. Check the year." });
    if (!(d.buyin > 0)) warnings.push({ field: "buyin", text: "No buy-in was read. It will be added as free / unknown." });
    var flagged = arr(d.uncertain);
    var labels = { name: "name", date: "date", time: "start time", venue: "venue", buyin: "buy-in", gtd: "guarantee", structure: "format", category: "type" };
    flagged.forEach(function (f) {
      if (f === "date" && d.date && !blocking.some(function (b) { return b.field === "date"; })) warnings.push({ field: "date", text: "Claude wasn't sure of the date (no year printed?). Check it." });
      else if (f !== "date") warnings.push({ field: f, text: "Claude wasn't sure of the " + labels[f] + ". Check it." });
    });
    d.blocking = blocking;
    d.warnings = warnings;
    d.ready = blocking.length === 0;
    return d;
  }

  // Marks drafts that are already on the calendar. fingerprint(x) is the calendar's own identity
  // (date + name + venue, js/features/strategy.js) so this agrees with what the importer would skip.
  function markDuplicates(drafts, existing, fingerprint) {
    var seen = {};
    arr(existing).forEach(function (t) { if (t) seen[fingerprint(t)] = t; });
    drafts.forEach(function (d) {
      var key = d.date ? fingerprint({ date: d.date, name: d.name, venue: d.venue }) : null;
      var hit = key && seen[key];
      d.duplicate = !!hit;
      d.duplicateOf = hit ? { id: hit.id, name: hit.name, date: hit.date } : null;
      // the same event twice on one poster counts once
      if (key && !hit) seen[key] = { id: "poster", name: d.name, date: d.date };
    });
    return drafts;
  }

  // Everything from a parsed answer to the drafts the confirm screen shows.
  // ctx: {today, rateFor, existing, fingerprint}
  function buildDrafts(events, ctx) {
    var drafts = arr(events).map(function (e) { return normalizeEvent(e, ctx); });
    drafts.forEach(function (d, i) {
      d.include = false;
      d.index = i;
    });
    if (ctx && typeof ctx.fingerprint === "function") markDuplicates(drafts, ctx.existing, ctx.fingerprint);
    // ready events start ticked; doubtful, blocked and already-there ones are for the player to decide
    drafts.forEach(function (d) { d.include = d.ready && !d.duplicate; });
    return drafts;
  }

  function buyinInPesos(d) {
    var amount = num(d.buyin);
    if (d.currency === "PHP") return Math.round(amount * 100) / 100;
    return num(d.rate) > 0 ? Math.round(amount * num(d.rate)) : 0;
  }

  function priceText(d) {
    if (d.currency === "PHP" || !(d.buyin > 0)) return "";
    return "Poster price: " + d.currency + " " + d.buyin.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  // The event in the shape the calendar importer (importCalendarUpdateEvents) takes.
  function toImportEvent(d) {
    var notes = [d.notes, d.endDate ? "Runs to " + d.endDate : "", priceText(d)].filter(Boolean).join(" · ");
    var sat = d.category === "satellite";
    return {
      date: d.date,
      time: d.time || "",
      name: d.name,
      venue: d.venue,
      buyin: buyinInPesos(d),
      gtd: d.gtd,
      structure: sat && d.structure === "Regular" ? "Satellite / Qualifier" : d.structure,
      category: d.category,
      seatGuaranteed: false,
      notes: notes,
      source: "Poster photo",
      url: ""
    };
  }

  // What the button says, and whether anything can be added yet.
  function summary(drafts) {
    var list = arr(drafts);
    var chosen = list.filter(function (d) { return d.include; });
    return {
      found: list.length,
      chosen: chosen.length,
      blocked: list.filter(function (d) { return !d.ready; }).length,
      duplicates: list.filter(function (d) { return d.duplicate; }).length,
      withWarnings: list.filter(function (d) { return d.ready && d.warnings.length; }).length,
      canAdd: chosen.length > 0 && chosen.every(function (d) { return d.ready; })
    };
  }

  // Target size for a photo: never enlarge, long side at most MAX_IMAGE_SIDE.
  function fitSize(width, height) {
    var w = Math.max(1, Math.round(num(width))), h = Math.max(1, Math.round(num(height)));
    var long = Math.max(w, h);
    if (long <= MAX_IMAGE_SIDE) return { width: w, height: h, scaled: false };
    var k = MAX_IMAGE_SIDE / long;
    return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
  }

  var api = {
    MODEL: MODEL,
    MAX_TOKENS: MAX_TOKENS,
    MAX_EVENTS: MAX_EVENTS,
    MAX_IMAGE_SIDE: MAX_IMAGE_SIDE,
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES,
    STRUCTURES: STRUCTURES,
    CATEGORIES: CATEGORIES,
    CURRENCY_CODES: CURRENCY_CODES,
    SCHEMA: SCHEMA,
    buildPrompt: buildPrompt,
    buildRequest: buildRequest,
    parseResponse: parseResponse,
    recoverEvents: recoverEvents,
    normalizeTime: normalizeTime,
    normalizeEvent: normalizeEvent,
    revalidate: revalidate,
    markDuplicates: markDuplicates,
    buildDrafts: buildDrafts,
    buyinInPesos: buyinInPesos,
    priceText: priceText,
    toImportEvent: toImportEvent,
    summary: summary,
    fitSize: fitSize,
    dayLabel: dayLabel
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root && typeof root === "object") root.PokerHQPoster = api;
})(typeof window !== "undefined" ? window : undefined);
