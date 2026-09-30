"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const P = require("../js/data/poster.js");
const T = require("../js/data/trueroi.js");

const TODAY = "2026-09-30";
const fp = (t) => [String(t.date || "").slice(0, 10), String(t.name || "").toLowerCase().replace(/[^a-z0-9]+/g, ""), String(t.venue || "").toLowerCase().replace(/[^a-z0-9]+/g, "")].join("|");
const raw = (over) => Object.assign({ name: "Sunday Main Event", date: "2026-10-04", endDate: "", time: "14:00", venue: "Okada Manila", buyin: 5500, currency: "PHP", gtd: "₱1,000,000", structure: "Regular", category: "main", notes: "Late reg 2 levels", uncertain: [] }, over || {});
const ctx = (over) => Object.assign({ today: TODAY, rateFor: () => null, existing: [], fingerprint: fp }, over || {});

test("the request: the photo first, then the instructions; a model the proxy allows; structured output", () => {
  const image = { base64: "AAAA", mediaType: "image/jpeg" };
  const req = P.buildRequest(image, TODAY, "Okada Manila, October");
  assert.equal(req.model, "claude-sonnet-4-6");
  assert.equal(req.max_tokens, 6000);
  assert.ok(req.max_tokens <= 20000, "under the proxy's ceiling");
  assert.deepEqual(req.output_config.format.type, "json_schema");
  assert.equal(req.messages.length, 1);
  assert.equal(req.messages[0].role, "user");
  const [img, txt] = req.messages[0].content;
  assert.deepEqual(img, { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
  assert.equal(txt.type, "text");
  assert.equal(P.buildRequest({ base64: "x" }, TODAY).messages[0].content[0].source.media_type, "image/jpeg", "jpeg unless told otherwise");
});

test("the instructions say what matters: today's date, no inventing, the year rule, categories, currency, nothing but JSON", () => {
  const text = P.buildPrompt(TODAY, "");
  assert.match(text, /Today's date is 2026-09-30/);
  assert.match(text, /never invent an event, date, time, buy-in or guarantee/);
  assert.match(text, /next occurrence on or after today \(2026-09-30\)/);
  assert.match(text, /YYYY-MM-DD/);
  assert.match(text, /24-hour HH:MM/);
  assert.match(text, /3-letter code/);
  assert.match(text, /"satellite" ONLY when the prize is a seat/);
  assert.match(text, /A Day 1 flight of a Main.*NOT a satellite/);
  assert.match(text, /"uncertain"/);
  assert.match(text, /Answer with JSON matching the schema and nothing else/);
  assert.doesNotMatch(text, /Extra context from the player/, "no hint, no hint line");
  assert.match(P.buildPrompt(TODAY, "  Okada   Manila\nOctober "), /Extra context from the player: Okada Manila October/);
  assert.ok(P.buildPrompt(TODAY, "x".repeat(2000)).length < 6000, "a huge hint is cut");
  P.STRUCTURES.forEach((s) => assert.ok(text.includes(s), s + " is offered to the model"));
});

test("the answer schema is one strict structured output can take: all properties required, none extra", () => {
  const item = P.SCHEMA.properties.events.items;
  assert.equal(P.SCHEMA.additionalProperties, false);
  assert.equal(item.additionalProperties, false);
  assert.deepEqual([...item.required].sort(), Object.keys(item.properties).sort(), "every event property is required");
  assert.deepEqual([...P.SCHEMA.required].sort(), Object.keys(P.SCHEMA.properties).sort());
  assert.deepEqual(item.properties.category.enum, P.CATEGORIES);
  assert.deepEqual(item.properties.structure.enum, P.STRUCTURES);
  assert.equal(item.properties.uncertain.items.type, "string");
  assert.doesNotThrow(() => JSON.stringify(P.SCHEMA));
});

test("reading the answer: whole JSON, cut-off JSON, JSON in a code fence, and things that are not events", () => {
  const whole = JSON.stringify({ events: [raw(), raw({ name: "Turbo" })], posterNotes: "Ignored the cash-game list." });
  const a = P.parseResponse(whole);
  assert.equal(a.ok, true);
  assert.equal(a.events.length, 2);
  assert.equal(a.notes, "Ignored the cash-game list.");
  assert.equal(a.truncated, false);
  // cut off in the middle of the third event: the two complete ones survive
  const cut = whole.replace(/\]\s*,\s*"posterNotes"[\s\S]*$/, "") + ',{"name":"Cut off","date":"2026-1';
  const b = P.parseResponse(cut);
  assert.equal(b.ok, true);
  assert.equal(b.events.length, 2);
  assert.equal(b.truncated, true);
  // wrapped in a code fence and prose
  const c = P.parseResponse("Here you go:\n```json\n" + whole + "\n```");
  assert.equal(c.ok, true);
  assert.equal(c.events.length, 2);
  // nothing usable
  ["", "   ", null, undefined, "sorry, I can't read that", "{}", '{"events":[]}', '{"events":[1,"x",null,[]]}'].forEach((t) => {
    const r = P.parseResponse(t);
    assert.equal(r.ok, false, String(t));
    assert.ok(r.message.length > 10);
  });
  assert.match(P.parseResponse('{"events":[]}').message, /No tournaments were found on that poster/);
  // too many
  const many = P.parseResponse(JSON.stringify({ events: Array.from({ length: 80 }, (_, i) => raw({ name: "E" + i })), posterNotes: "" }));
  assert.equal(many.events.length, P.MAX_EVENTS);
  assert.match(many.notes, /Only the first 60 events are shown/);
});

test("start times: every way a poster writes them", () => {
  const cases = { "14:00": "14:00", "2PM": "14:00", "2 pm": "14:00", "2:30 PM": "14:30", "12PM": "12:00", "12 nn": "12:00", "12NN": "12:00", "12AM": "00:00", "12MN": "00:00", "9:05am": "09:05", "0930": "09:30", "1400": "14:00", "8": "08:00", "7 P.M.": "19:00", "2PM onwards": "14:00", "3pm start": "15:00", "23:59": "23:59" };
  Object.keys(cases).forEach((input) => assert.equal(P.normalizeTime(input), cases[input], input));
  ["", "TBD", "25:00", "13pm", "0pm", "9:75", "noon", "3 nn", "5 mn", null, undefined, "late afternoon"].forEach((bad) => assert.equal(P.normalizeTime(bad), "", String(bad)));
});

test("a clean event becomes a ready draft", () => {
  const d = P.normalizeEvent(raw(), ctx());
  assert.equal(d.name, "Sunday Main Event");
  assert.equal(d.date, "2026-10-04");
  assert.equal(d.time, "14:00");
  assert.equal(d.venue, "Okada Manila");
  assert.equal(d.buyin, 5500);
  assert.equal(d.currency, "PHP");
  assert.equal(d.category, "main");
  assert.equal(d.ready, true);
  assert.deepEqual(d.blocking, []);
  assert.deepEqual(d.warnings, []);
});

test("what blocks an event until the player fixes it", () => {
  const noDate = P.normalizeEvent(raw({ date: "TBD" }), ctx());
  assert.equal(noDate.ready, false);
  assert.equal(noDate.date, "");
  assert.deepEqual(noDate.blocking.map((b) => b.field), ["date"]);
  assert.equal(P.normalizeEvent(raw({ date: "2026-02-30" }), ctx()).date, "", "an impossible date is not a date");
  assert.equal(P.normalizeEvent(raw({ date: "Oct 4" }), ctx()).ready, false, "only YYYY-MM-DD is accepted");
  const noName = P.normalizeEvent(raw({ name: "  " }), ctx());
  assert.deepEqual(noName.blocking.map((b) => b.field), ["name"]);
  const usd = P.normalizeEvent(raw({ currency: "USD", buyin: 500 }), ctx());
  assert.equal(usd.ready, false);
  assert.deepEqual(usd.blocking.map((b) => b.field), ["rate"]);
  assert.match(usd.blocking[0].text, /exchange rate for USD/);
  // with a known rate (the trip's default) it is ready
  const withRate = P.normalizeEvent(raw({ currency: "USD", buyin: 500 }), ctx({ rateFor: (c) => (c === "USD" ? 58.4 : null) }));
  assert.equal(withRate.ready, true);
  assert.equal(withRate.rate, 58.4);
  // a foreign currency with no buy-in read needs no rate
  assert.equal(P.normalizeEvent(raw({ currency: "USD", buyin: 0 }), ctx()).ready, true);
});

test("what only warns: past dates, no buy-in, and anything the model was unsure of", () => {
  const old = P.normalizeEvent(raw({ date: "2026-06-01" }), ctx());
  assert.equal(old.ready, true);
  assert.match(old.warnings[0].text, /more than a month ago/);
  assert.equal(P.normalizeEvent(raw({ date: "2026-09-05" }), ctx()).warnings.length, 0, "25 days ago is close enough");
  const free = P.normalizeEvent(raw({ buyin: 0 }), ctx());
  assert.equal(free.ready, true);
  assert.match(free.warnings[0].text, /No buy-in was read/);
  const unsure = P.normalizeEvent(raw({ uncertain: ["date", "venue", "bogus", "venue", "time"] }), ctx());
  assert.deepEqual(unsure.uncertain, ["date", "venue", "time"], "known fields only, once each");
  assert.equal(unsure.ready, true);
  assert.deepEqual(unsure.warnings.map((w) => w.field).sort(), ["date", "time", "venue"]);
  assert.match(unsure.warnings.find((w) => w.field === "date").text, /wasn't sure of the date/);
  // an unrecognised currency is treated as pesos and flagged
  const odd = P.normalizeEvent(raw({ currency: "XYZ", buyin: 100 }), ctx());
  assert.equal(odd.currency, "PHP");
  assert.ok(odd.warnings.some((w) => w.field === "buyin"));
});

test("tidying what the model sent", () => {
  const d = P.normalizeEvent(raw({ name: "  Big   Sunday\nMain ", buyin: "₱5,500", structure: "Mystery", category: "weird", venue: "  Okada\tManila ", gtd: "x".repeat(100), endDate: "2026-10-03" }), ctx());
  assert.equal(d.name, "Big Sunday Main");
  assert.equal(d.buyin, 5500, "a printed amount with a symbol and comma is read");
  assert.equal(d.structure, "Regular");
  assert.equal(d.category, "side");
  assert.equal(d.venue, "Okada Manila");
  assert.equal(d.gtd.length, 40);
  assert.equal(d.endDate, "", "an end date before the start is dropped");
  assert.equal(P.normalizeEvent(raw({ endDate: "2026-10-06" }), ctx()).endDate, "2026-10-06");
  assert.equal(P.normalizeEvent(raw({ category: "satellite", structure: "" }), ctx()).structure, "Satellite / Qualifier");
  assert.equal(P.normalizeEvent(raw({ buyin: -5 }), ctx()).buyin, 0);
  assert.equal(P.normalizeEvent(raw({ buyin: "free" }), ctx()).buyin, 0);
  assert.equal(P.normalizeEvent(null, ctx()).ready, false, "nothing at all is not an event");
  assert.equal(P.normalizeEvent(raw({ name: "x".repeat(300) }), ctx()).name.length, 100);
});

test("events already on the calendar are marked, and start unticked", () => {
  const existing = [{ id: 7, date: "2026-10-04", name: "Sunday Main Event", venue: "Okada Manila" }];
  const drafts = P.buildDrafts([raw(), raw({ name: "Monday Turbo", date: "2026-10-05" }), raw({ date: "" }), raw({ name: "Monday Turbo", date: "2026-10-05" })], ctx({ existing }));
  assert.equal(drafts.length, 4);
  assert.equal(drafts[0].duplicate, true);
  assert.deepEqual(drafts[0].duplicateOf, { id: 7, name: "Sunday Main Event", date: "2026-10-04" });
  assert.equal(drafts[0].include, false, "already there: not ticked");
  assert.equal(drafts[1].duplicate, false);
  assert.equal(drafts[1].include, true, "new and ready: ticked");
  assert.equal(drafts[2].include, false, "blocked: not ticked");
  assert.equal(drafts[3].duplicate, true, "the same event twice on one poster counts once");
  assert.equal(drafts[3].include, false);
  assert.deepEqual(drafts.map((d) => d.index), [0, 1, 2, 3]);
  const s = P.summary(drafts);
  assert.deepEqual(s, { found: 4, chosen: 1, blocked: 1, duplicates: 2, withWarnings: 0, canAdd: true });
});

test("the summary knows when there is nothing to add, and when a ticked event is not ready", () => {
  const drafts = P.buildDrafts([raw({ date: "" })], ctx());
  assert.equal(P.summary(drafts).canAdd, false, "nothing ticked");
  drafts[0].include = true;
  assert.equal(P.summary(drafts).canAdd, false, "ticked but blocked");
  drafts[0].date = "2026-10-04";
  P.revalidate(drafts[0], ctx());
  assert.equal(P.summary(drafts).canAdd, true, "fixed");
  assert.equal(P.summary([]).canAdd, false);
  assert.equal(P.summary(null).found, 0);
});

test("editing a draft re-checks it: giving a rate or a date clears the block", () => {
  const d = P.normalizeEvent(raw({ currency: "TWD", buyin: 15000, date: "" }), ctx());
  assert.deepEqual(d.blocking.map((b) => b.field).sort(), ["date", "rate"]);
  d.date = "2026-10-10"; d.rate = 1.82;
  P.revalidate(d, ctx());
  assert.equal(d.ready, true);
  assert.equal(P.buyinInPesos(d), 27300);
});

test("converted to what the calendar importer takes: pesos, the poster's own price in the notes, the time, the source", () => {
  const php = P.toImportEvent(P.normalizeEvent(raw({ endDate: "2026-10-06" }), ctx()));
  assert.deepEqual(php, { date: "2026-10-04", time: "14:00", name: "Sunday Main Event", venue: "Okada Manila", buyin: 5500, gtd: "₱1,000,000", structure: "Regular", category: "main", seatGuaranteed: false, notes: "Late reg 2 levels · Runs to 2026-10-06", source: "Poster photo", url: "" });
  const usd = P.normalizeEvent(raw({ currency: "USD", buyin: 500, notes: "" }), ctx({ rateFor: () => 58.4 }));
  const e = P.toImportEvent(usd);
  assert.equal(e.buyin, 29200);
  assert.equal(e.notes, "Poster price: USD 500");
  const sat = P.toImportEvent(P.normalizeEvent(raw({ category: "satellite", structure: "Regular", name: "Main Event Satellite" }), ctx()));
  assert.equal(sat.structure, "Satellite / Qualifier");
  assert.equal(sat.category, "satellite");
  assert.equal(P.buyinInPesos({ buyin: 100, currency: "USD", rate: null }), 0, "no rate, no pesos");
  assert.equal(P.priceText({ buyin: 0, currency: "USD" }), "");
});

test("photos: never enlarged, long side at most 1568, proportions kept", () => {
  assert.deepEqual(P.fitSize(800, 600), { width: 800, height: 600, scaled: false });
  assert.deepEqual(P.fitSize(1568, 1000), { width: 1568, height: 1000, scaled: false });
  assert.deepEqual(P.fitSize(3136, 2000), { width: 1568, height: 1000, scaled: true });
  assert.deepEqual(P.fitSize(3000, 4000), { width: 1176, height: 1568, scaled: true });
  assert.deepEqual(P.fitSize(0, 0), { width: 1, height: 1, scaled: false });
  assert.ok(P.MAX_IMAGE_BYTES < 5 * 1024 * 1024, "under Claude's 5 MB image limit");
});

test("the currencies the poster reader knows are the ones the trip costs know", () => {
  assert.deepEqual([...P.CURRENCY_CODES].sort(), T.CURRENCIES.map((c) => c.code).sort());
});

test("the model and size are ones the AI proxy allows (no server change is needed for pictures)", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "functions", "index.js"), "utf8");
  const allowed = [...server.match(/ALLOWED_MODELS\s*=\s*new Set\(\[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const ceiling = Number(server.match(/MAX_TOKENS_CEILING\s*=\s*(\d+)/)[1]);
  assert.ok(allowed.includes(P.MODEL), P.MODEL + " is allowed by pokerhqAiCall");
  assert.ok(P.MAX_TOKENS <= ceiling);
  // the proxy checks only messages / model / max_tokens, so an image block goes straight through to Anthropic
  const guard = server.slice(server.indexOf("exports.pokerhqAiCall"), server.indexOf("pokerhqOpenAiCall — owner-only"));
  assert.match(guard, /Array\.isArray\(body\.messages\)/);
  assert.doesNotMatch(guard, /typeof m\.content|content\s*===\s*"string"|content must be/i, "the proxy does not insist on text-only message content");
  // the request goes out as a callable (10 MB limit) with base64 inflating the picture by a third
  assert.ok(P.MAX_IMAGE_BYTES * 4 / 3 < 9 * 1024 * 1024, "the largest allowed picture still fits in the callable request");
});

// ---- wiring: the pieces the page needs are all hooked up ----
const rootDir = path.join(__dirname, "..");
const readFile = (f) => fs.readFileSync(path.join(rootDir, f), "utf8");

test("WIRING the poster files are loaded by the page and cached for offline use", () => {
  const html = readFile("index.html");
  const sw = readFile("sw.js");
  ["js/data/poster.js", "js/features/poster-import.js"].forEach((f) => {
    assert.match(html, new RegExp('<script src="\\./' + f.replace(/[./]/g, "\\$&") + '(\\?v=[^"]*)?"'), f + " has a script tag in index.html");
    assert.ok(sw.includes("./" + f), f + " is precached by sw.js");
  });
  assert.ok(html.indexOf("js/data/poster.js") < html.indexOf("js/features/poster-import.js"), "the pure module loads before the feature that uses it");
});

test("WIRING the button, pop-up and every id the feature looks up exist in index.html", () => {
  const html = readFile("index.html");
  const feature = readFile("js/features/poster-import.js");
  assert.match(html, /<button[^>]*id="cal-poster-btn"[^>]*onclick="openPosterImport\(\)"/);
  const ids = new Set([...feature.matchAll(/posterEl\('([^']+)'\)/g)].map((m) => m[1]));
  ["modal-poster", "poster-stage-pick", "poster-stage-reading", "poster-stage-confirm", "poster-file", "poster-add-btn", "poster-drafts"].forEach((id) => ids.add(id));
  ids.forEach((id) => assert.match(html, new RegExp('id="' + id + '"'), "#" + id + " exists in index.html"));
  // every function the markup calls is defined by the feature
  const called = new Set([...html.matchAll(/on(?:click|change)="(poster\w+|openPosterImport|closePosterImport|addPosterEvents)\(/g)].map((m) => m[1]));
  assert.ok(called.size >= 4, "the pop-up has its buttons hooked up");
  called.forEach((fn) => assert.match(feature, new RegExp("function " + fn + "\\("), fn + " is defined in poster-import.js"));
});

test("WIRING money boxes are blurred by Privacy Mode and the photo is never stored", () => {
  const feature = readFile("js/features/poster-import.js");
  assert.match(feature, /type="number" data-money/, "the buy-in box on each card is marked data-money");
  assert.doesNotMatch(feature, /localStorage|sessionStorage|indexedDB|save\('poster/, "the photo and its reading are not saved anywhere");
});

test("WIRING the calendar importer keeps the start time the poster reader found (push alerts read it)", () => {
  const cal = readFile("js/features/calendar.js");
  assert.match(cal, /\^\\d\{2\}:\\d\{2\}\$\/\.test\(ev\.time/, "importCalendarUpdateEvents copies a valid HH:MM time");
  const events = readFile("functions/events.js");
  assert.match(events, /\.time/, "the alert code reads the tournament's time field");
});
