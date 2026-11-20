"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const NOW = Date.parse("2026-11-18T10:00:00Z");
const URL_A = "https://room.example/schedule?edition=2026";
const URL_B = "https://room.example/corrected-schedule";
const dates = { from: "2026-11-18", to: "2027-01-13" };
const INDEX = "https://www.pokerstarslivemanila.com/tournaments/";
const SCHEDULE = INDEX + "megastack25/";
const event = (patch) => Object.assign({
  date: "2026-11-20", time: "19:00", name: "Friday Deepstack", venue: "Metro Card Club",
  buyin: 3000, gtd: "PHP 100,000", structure: "Deep Stack", category: "side",
  seatGuaranteed: false, region: "ph", accessible: true, notes: "30-minute levels",
  source: "Room schedule", url: URL_A,
}, patch);
const searchCall = (urls = [URL_A]) => ({type: "web_search_call", status: "completed",
  action: {type: "search", sources: urls.map((url) => ({type: "url", url}))}});
const response = (events, patch) => Object.assign({status: "completed", output: [searchCall()],
  output_text: JSON.stringify({asOf: dates.from, events})}, patch);

function load() {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  const c = {Date: Clock, URL, Set, Map, console, window: {tourneys: []},
    document: {getElementById: () => null}, localStorage: {getItem: () => null, setItem() {}},
    alert() {}, confirm: () => true, MONTH_SHORT_UPPER: ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"],
    saves: 0, renders: 0, save() { c.saves++; }, toDateInputValue(d) {
      return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
    }, hasOpenAIResponsesAccess: () => true, isSatelliteTourney: (t) => t.sat,
  };
  vm.createContext(c);
  for (const file of ["js/features/strategy.js", "js/features/calendar.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), c);
  }
  c.renderCalendar = () => { c.renders++; };
  return c;
}
const run = (c, data) => {
  c.callOpenAIResponses = async (body) => { c.request = body; return {ok: true, json: async () => data}; };
  return c.runOneCalendarSearch({label: "Metro", local: true, windowDates: dates, prompt: "Find current tournaments"});
};
const opts = () => ({research: true, sources: new Set([URL_A, URL_B]), windowDates: dates});
const opened = (url) => ({type: "web_search_call", status: "completed", action: {type: "open_page", url}});
const indexTask = (c) => {
  const venue = c.CALENDAR_MANILA_SEARCHES.find((s) => s.indexUrl);
  return {...venue, local: true, windowDates: dates, prompt: c.buildCalendarVenuePrompt(venue)};
};
// Reading links from an index does not add its targets to action.sources.
const discovery = (patch) => ({status: "completed", output: [opened(INDEX)],
  output_text: JSON.stringify({asOf: dates.from, schedules: [{name: "Megastack 25", url: SCHEDULE,
    from: "2026-11-26", to: "2026-12-07"}], skipped: [], ...patch})});

test("Manila room profiles include Metro's public feed and search Prime/2Ace as one room", () => {
  const c = load();
  const metro = c.CALENDAR_MANILA_SEARCHES.find((room) => room.label === 'Metro Card Club');
  assert.ok(metro.sourceUrls.includes('https://metrocardclub.com/wp-json/wp/v2/pages?slug=big-events'));
  const prompt = c.buildCalendarVenuePrompt(metro);
  assert.match(prompt, /Add the entry-fee to the buy-in/);
  assert.match(prompt, /Do not omit a confirmed Manila event because its buy-in exceeds/);
  const prime = c.CALENDAR_MANILA_SEARCHES.filter((room) => /Prime|2Ace/i.test(room.query));
  assert.equal(prime.length, 1);
  assert.match(prime[0].query, /2Ace/);
  assert.ok(prime[0].sourceUrls.includes('https://www.facebook.com/GGPOKERROOM/'));
});

test("empty room searches follow alternate sources and import dated named events with full entry fees", async () => {
  const c = load(), requests = [];
  const metro = c.CALENDAR_MANILA_SEARCHES[0];
  const feed = metro.sourceUrls.find((url) => url.includes('wp-json'));
  c.callOpenAIResponses = async (body) => {
    requests.push(body);
    return {ok: true, json: async () => requests.length === 1 ? response([], {output_text: JSON.stringify({asOf: dates.from, events: [],
      skipped: [{name: 'Daily posters', date: '2026-10-26', url: metro.sourceUrls[0], reason: 'Printed dates are in the past'}]})})
      : response([event({date: '2026-12-09', time: '', name: 'Metro Christmas Special', buyin: 11000, url: feed}),
        event({date: '2027-01-04', time: '', name: 'Metro Million Showdown', buyin: 1500, url: feed})], {output: [opened(feed)]})};
  };
  const [r] = await c.runCalendarSearches([{...metro, roomSearch: true, local: true, windowDates: dates, prompt: c.buildCalendarVenuePrompt(metro)}], 1);
  assert.equal(requests.length, 2);
  assert.match(requests[1].input, /FOLLOW-UP FOR MISSING ROOM COVERAGE/);
  assert.match(requests[1].input, /Printed dates are in the past/);
  assert.equal(r.events.length, 2);
  assert.equal(r.searchCount, 2);
  assert.equal(r.error, '');
  assert.match(r.skipped[0].reason, /First search/);
  const imported = c.importCalendarUpdateEvents(r.events, {research: true, sources: new Set(r.sources), windowDates: dates});
  assert.equal(imported.added.length, 2);
  assert.equal(imported.added[0].buyin, 11000);
});

test("successful room searches do not repeat; auth failures are not retried", async () => {
  const c = load();
  let count = 0;
  c.callOpenAIResponses = async () => { count++; return {ok: true, json: async () => response([event()])}; };
  assert.equal((await c.runCalendarRoomSearch({label: 'Metro', windowDates: dates, prompt: 'Find events'})).events.length, 1);
  assert.equal(count, 1);
  c.callOpenAIResponses = async () => { count++; return {ok: false, status: 401}; };
  assert.match((await c.runCalendarRoomSearch({label: 'Metro', windowDates: dates, prompt: 'Find events'})).error, /key was rejected/);
  assert.equal(count, 2, 'no second paid call for a rejected key');
});

test("unverified rooms remain empty after follow-up and show the remaining evidence gap", async () => {
  const c = load();
  let count = 0;
  c.callOpenAIResponses = async () => { count++; return {ok: true, json: async () => response([])}; };
  const r = await c.runCalendarRoomSearch({label: 'Masters', windowDates: dates, prompt: 'Find events', sourceUrls: [URL_A]});
  assert.equal(count, 2);
  assert.equal(r.events.length, 0);
  assert.equal(c.window.tourneys.length, 0);
  assert.match(r.skipped[0].reason, /No current dated tournament with a verified entry cost after two searches/);
  assert.equal(r.skipped[0].url, URL_A);
});

test("PokerStars opens the index, discovers current links and reads each week of the linked schedule", async () => {
  const c = load(), requests = [];
  c.callOpenAIResponses = async (body) => {
    requests.push(body);
    assert.equal(require("../functions/openai-proxy.js").validateResponsesRequest(body).ok, true);
    let data;
    if (body.text.format.schema.properties.schedules) data = discovery();
    else {
      const from = /start date is between (\d{4}-\d{2}-\d{2})/.exec(body.input)[1];
      data = response([event({date: from, name: "Flight " + from, url: SCHEDULE})], {output: [opened(SCHEDULE)]});
    }
    return {ok: true, json: async () => data};
  };
  const [r] = await c.runCalendarSearches([indexTask(c)], 1);
  assert.equal(r.error, "");
  assert.equal(requests.length, 3, "index discovery plus two bounded schedule extractions");
  assert.match(requests[0].input, /Open this official tournament index FIRST/);
  assert.match(requests[0].input, /https:\/\/www.pokerstarslivemanila.com\/tournaments\//);
  assert.match(requests[0].input, /Follow its current tournament schedule links, including Daily Tournaments/);
  assert.equal(r.events.length, 2);
  assert.equal(r.events[0].date, "2026-11-26");
  assert.equal(r.events[1].date, "2026-12-03");
  assert.equal(r.searchCount, 3);
  assert.ok(r.sources.includes(c.calendarSourceKey(SCHEDULE)));
});

test("finding the index in search results does not count as opening it", async () => {
  const c = load();
  c.callOpenAIResponses = async () => ({ok: true, json: async () => ({...discovery(), output: [searchCall([INDEX, SCHEDULE])]})});
  const r = await c.runCalendarIndexSearch(indexTask(c));
  assert.match(r.error, /did not open the official tournament index/);
  assert.equal(r.events.length, 0);
});

test("discovery explains stale and unsafe links instead of following them", async () => {
  const c = load();
  c.callOpenAIResponses = async () => ({ok: true, json: async () => discovery({schedules: [
    {name: "Old schedule", url: SCHEDULE, from: "2025-01-01", to: "2025-01-10"},
    {name: "Outside schedule directory", url: "https://www.pokerstarslivemanila.com/venue/", from: "", to: ""},
    {name: "External link", url: "https://unrelated.example/tournaments/", from: "", to: ""}
  ], skipped: [{name: "No schedule yet", date: "", url: INDEX, reason: "No linked timetable published"}]})});
  const r = await c.runCalendarIndexSearch(indexTask(c));
  assert.equal(r.error, "");
  assert.equal(r.events.length, 0);
  assert.equal(r.skipped.length, 4);
  assert.match(r.skipped[0].reason, /Source review: No linked timetable/);
  assert.match(r.skipped[1].reason, /outside the next eight weeks/);
  assert.match(r.skipped[2].reason, /not an official tournament schedule URL/);
});

test("each schedule must actually be opened, and a failed week does not discard a successful week", async () => {
  const c = load();
  c.callOpenAIResponses = async (body) => {
    let data = discovery();
    if (!body.text.format.schema.properties.schedules) {
      const first = body.input.includes("between 2026-11-26 and 2026-12-02");
      data = response([event({date: "2026-12-03", url: SCHEDULE})], {output: first ? [searchCall([SCHEDULE])] : [opened(SCHEDULE)]});
    }
    return {ok: true, json: async () => data};
  };
  const r = await c.runCalendarIndexSearch(indexTask(c));
  assert.equal(r.events.length, 1);
  assert.match(r.skipped[0].reason, /did not open the linked schedule/);
  assert.equal(r.skipped[0].url, c.calendarSourceKey(SCHEDULE));
});

test("PokerStars slash and canonical URL forms corroborate the same opened schedule", async () => {
  const c = load();
  const url = INDEX + 'december-special/';
  const canonical = url.slice(0, -1);
  c.callOpenAIResponses = async () => ({ok: true, json: async () => response([
    event({date: '2026-12-08', url})
  ], {output: [opened(canonical)]})});
  const r = await c.runOneCalendarSearch({...indexTask(c), scheduleUrl: url});
  assert.equal(r.error, '');
  assert.equal(r.events.length, 1);
  assert.notEqual(c.calendarSourceKey(url + '?edition=2026'), c.calendarSourceKey(url + '?edition=2025'));
  assert.notEqual(c.calendarSourceKey(URL_A), c.calendarSourceKey(URL_A.replace('schedule?', 'schedule/?')));
});

test("schedule extraction rejects another week's dates and another page's events with reasons", async () => {
  const c = load();
  c.callOpenAIResponses = async () => ({ok: true, json: async () => response([
    event({date: '2026-11-26', url: SCHEDULE}),
    event({date: '2026-12-03', url: SCHEDULE}),
    event({date: '2026-11-26', url: URL_A})
  ], {output: [opened(SCHEDULE), searchCall([URL_A])]})});
  const r = await c.runOneCalendarSearch({...indexTask(c), indexUrl: undefined, scheduleUrl: SCHEDULE,
    eventDates: {from: '2026-11-26', to: '2026-12-02'}});
  assert.equal(r.events.length, 1);
  assert.match(r.skipped[0].reason, /outside this schedule/);
  assert.match(r.skipped[1].reason, /does not match the opened schedule/);
});

test("skipped details retain event identity, source and a specific reason from research and import checks", async () => {
  const c = load();
  const r = await run(c, response([event({name: "Bad date", date: "2026-11-31"}), event({name: "Missing cost", buyin: null}),
    event({name: "Unknown source", url: URL_B})], {output_text: JSON.stringify({asOf: dates.from,
      events: [event({name: "Bad date", date: "2026-11-31"}), event({name: "Missing cost", buyin: null}), event({name: "Unknown source", url: URL_B})],
      skipped: [{name: "Final", date: "2026-11-21", url: URL_A, reason: "Continuation with no new entry"}]})}));
  assert.equal(r.rejected, 3);
  assert.equal(r.skipped.length, 4);
  assert.match(r.skipped.find((s) => s.name === "Bad date").reason, /invalid date/);
  assert.match(r.skipped.find((s) => s.name === "Missing cost").reason, /buyin/);
  assert.match(r.skipped.find((s) => s.name === "Unknown source").reason, /source not found/);
  assert.equal(r.skipped[0].url, URL_A);
  const conflict = c.importCalendarUpdateEvents([event(), event({buyin: 5000})], opts());
  assert.equal(conflict.skipped.length, 2);
  assert.match(conflict.skipped[0].reason, /conflicting/);
  c.window.tourneys.push({...event(), id: 1}, {...event(), id: 2});
  const duplicate = c.importCalendarUpdateEvents([event()], opts());
  assert.match(duplicate.skipped[0].reason, /multiple saved events/);
});

test("Manila research days are independent of device timezone and span eight weeks", () => {
  const c = load();
  assert.equal(c.calendarResearchWindow(Date.parse("2026-11-17T16:00:00Z")).from, dates.from);
  assert.equal(c.calendarResearchWindow(Date.parse("2026-11-17T15:59:59Z")).from, "2026-11-17");
  assert.equal(c.calendarResearchWindow(NOW).to, dates.to);
});

test("rejects missing, rollover, stale and out-of-window dates without silently repairing them", () => {
  const c = load();
  for (const date of ["", null, "TBD", "2026-2-03", "2026-02-30", "2026-11-31", "2026-13-01", "2026-00-12", "2026-11-17", "2027-01-14", "November 20, 2026", "2026-11-20 to 2026-11-23"]) {
    const report = c.importCalendarUpdateEvents([event({date})], opts());
    assert.equal(report.rejected, 1, String(date));
    assert.equal(c.window.tourneys.length, 0);
  }
  assert.equal(c.validCalendarResearchDate("2028-02-29"), true);
  assert.equal(c.validCalendarResearchDate("2027-02-29"), false);
  const r = c.importCalendarUpdateEvents([event({date: dates.from}), event({date: dates.to})], opts());
  assert.equal(r.added.length, 2, "inclusive window boundaries");
});

test("entry costs must be explicit finite nonnegative numbers, with explicit free events retained", () => {
  const c = load();
  for (const buyin of [undefined, null, "", "3,000", "3000", "3000 USD", -1, Infinity, NaN, true]) {
    assert.equal(c.importCalendarUpdateEvents([event({buyin})], opts()).rejected, 1, String(buyin));
  }
  assert.equal(c.importCalendarUpdateEvents([event({name: "Confirmed freeroll", buyin: 0})], opts()).added[0].buyin, 0);
  assert.equal(c.importCalendarUpdateEvents([event({buyin: 3000.50})], opts()).added[0].buyin, 3000.50);
});

test("start times are strict HH:MM, unknown times stay empty, and contradictory tags are blocked", () => {
  const c = load();
  for (const time of [undefined, null, "7pm", "7:00", "24:00", "23:60", "-1:00", "19:00:00"]) {
    assert.equal(c.importCalendarUpdateEvents([event({time})], opts()).rejected, 1, String(time));
  }
  for (const time of ["", "00:00", "23:59"]) {
    assert.equal(c.importCalendarUpdateEvents([event({name: "Time " + time, time})], opts()).added.length, 1);
  }
  for (const patch of [{category: "main", seatGuaranteed: true}, {category: "satellite", seatGuaranteed: false},
    {structure: "Satellite / Qualifier"}, {category: "guess"}]) {
    assert.equal(c.importCalendarUpdateEvents([event(patch)], opts()).rejected, 1);
  }
});

test("source links must match retrieved URLs, including their paths and queries", async () => {
  const c = load();
  const r = await run(c, response([event(), event({name: "Missing link", url: ""}),
    event({name: "Guessed page", url: "https://room.example/not-retrieved"}),
    event({name: "Other edition", url: "https://room.example/schedule?edition=2025"}),
    event({name: "Missing source", source: ""}), event({name: "Script", url: "javascript:alert(1)"}),
    event({name: "Credentials", url: "https://user:pass@room.example/schedule?edition=2026"}),
    event({name: "Section", url: URL_A + "#friday"})]));
  assert.equal(r.error, "");
  assert.equal(r.events.length, 2);
  assert.equal(r.rejected, 6);
  assert.equal(c.request.tool_choice, "required");
  assert.equal(c.request.include[0], "web_search_call.action.sources");
});

test("annotations and completed open-page actions can corroborate a source", async () => {
  const c = load();
  for (const output of [
    [searchCall([]), {type: "message", content: [{type: "output_text", annotations: [{type: "url_citation", url: URL_A}]}]}],
    [{type: "web_search_call", status: "completed", action: {type: "open_page", url: URL_A}}],
  ]) assert.equal((await run(c, response([event()], {output}))).events.length, 1);
});

test("no search, failed tools, stale research dates, refusals and unreadable JSON never count as successful research", async () => {
  const c = load();
  for (const patch of [{output: []}, {output: [{...searchCall(), status: "failed"}]},
    {output_text: JSON.stringify({asOf: "2025-11-18", events: [event()]})},
    {status: "failed"}, {output_text: "Cannot research this"},
    {output_text: JSON.stringify({events: [event()]})}]) {
    const r = await run(c, response([event()], patch));
    assert.ok(r.error, JSON.stringify(patch));
    assert.equal(r.events.length, 0);
  }
  const r = await run(c, response([]));
  assert.equal(r.error, "", "a real search with no listings is distinct from a failure");
});

test("truncated output recovers only complete objects and applies all validation to them", async () => {
  const c = load();
  const output_text = '{"asOf":"2026-11-18","events":[' + JSON.stringify(event()) + ',' +
    JSON.stringify(event({date: "2026-11-31"})) + ',{"name":"Cut off';
  const r = await run(c, response([], {status: "incomplete", output_text}));
  assert.equal(r.events.length, 1);
  assert.equal(r.rejected, 1);
  assert.equal(r.truncated, true);
});

test("recovered objects must also satisfy required field types and enums", async () => {
  const c = load();
  const events = [event({structure: undefined}), event({gtd: {amount: 100000}}),
    event({region: "unknown"}), event({accessible: "true"}), event({notes: null})];
  const r = await run(c, response(events));
  assert.equal(r.events.length, 0);
  assert.equal(r.rejected, events.length);
});

test("reruns update prices, times, guarantees, sources and classification while preserving plans and personal data", () => {
  const c = load();
  c.window.tourneys.push({...event(), id: 42, planning: true, notes: "Travel with Sam", sessionId: "session-1", custom: "keep"});
  const r = c.importCalendarUpdateEvents([event({buyin: 5000, time: "20:30", gtd: "PHP 200,000", url: URL_B,
    category: "main", structure: "Re-entry", notes: "Revised schedule"})], opts());
  assert.equal(r.added.length, 0);
  assert.equal(r.changes.length, 1);
  const t = c.window.tourneys[0];
  assert.equal(t.id, 42); assert.equal(t.planning, true); assert.equal(t.sessionId, "session-1");
  assert.equal(t.custom, "keep"); assert.equal(t.notes, "Travel with Sam");
  assert.equal(t.researchNotes, "Revised schedule"); assert.equal(t.buyin, 5000); assert.equal(t.time, "20:30");
  assert.equal(t.gtd, "PHP 200,000"); assert.equal(t.url, URL_B); assert.equal(t.type, "main");
  assert.equal(t.sourceVerification, "search-result"); assert.ok(t.sourceCheckedAt);
  assert.equal(t.timeZone, "Asia/Manila"); assert.equal(c.saves, 1);
});

test("unchanged reruns do not write; missing optional details do not erase known information", () => {
  const c = load();
  c.importCalendarUpdateEvents([event()], opts());
  const r = c.importCalendarUpdateEvents([event()], opts());
  assert.equal(r.added.length, 0); assert.equal(r.changes.length, 0); assert.equal(r.unchanged, 1);
  assert.equal(c.saves, 1);
  c.importCalendarUpdateEvents([event({buyin: 4000, time: "", gtd: "", notes: ""})], opts());
  assert.equal(c.window.tourneys[0].time, "19:00");
  assert.equal(c.window.tourneys[0].gtd, "PHP 100,000");
  assert.equal(c.window.tourneys[0].notes, "30-minute levels");
});

test("separate flights remain separate; conflicting results and ambiguous saved identities are skipped", () => {
  const c = load();
  const r = c.importCalendarUpdateEvents([event({name: "Main Day 1A"}), event({name: "Main Day 1B"})], opts());
  assert.equal(r.added.length, 2);
  assert.equal(c.importCalendarUpdateEvents([event(), event({buyin: 5000})], opts()).rejected, 2);
  assert.equal(c.importCalendarUpdateEvents([event(), event({time: ""}), event({time: "20:00"})], opts()).rejected, 3,
    "an unknown time between two conflicting starts cannot hide the conflict");
  assert.equal(c.window.tourneys.length, 2);
  c.window.tourneys.push({...event(), id: 1}, {...event(), id: 2});
  assert.equal(c.importCalendarUpdateEvents([event({buyin: 6000})], opts()).rejected, 1);
  assert.equal(c.window.tourneys.find((t) => t.id === 1).buyin, 3000);
});

test("Undo restores changed details and removes additions while keeping subsequent personal edits", () => {
  const c = load();
  c.importCalendarUpdateEvents([event()], opts());
  c.window.tourneys[0].id = 42;
  const r = c.importCalendarUpdateEvents([event({buyin: 5000, time: "20:00"}), event({name: "New event"})], opts());
  c.window.tourneys.find((t) => t.id === 42).planning = true;
  c.window.tourneys.find((t) => t.id === 42).notes = "Personal edit after refresh";
  c.undoCalendarResearch(r);
  assert.equal(c.window.tourneys.length, 1);
  const t = c.window.tourneys[0];
  assert.equal(t.buyin, 3000); assert.equal(t.time, "19:00"); assert.equal(t.planning, true);
  assert.equal(t.notes, "Personal edit after refresh");
});

test("user-reviewed posters keep the original array contract without research-only source/window rules", () => {
  const c = load();
  const added = c.importCalendarUpdateEvents([event({date: "2020-10-01", url: "", source: "Poster", time: "18:30"})]);
  assert.ok(Array.isArray(added)); assert.equal(added.length, 1); assert.equal(added[0].time, "18:30");
  assert.equal(c.importCalendarUpdateEvents([event({date: "2020-10-01"})]).length, 0);
});

test("the full update reports changes and skips, and its Undo handles both inserts and updates", async () => {
  const c = load();
  c.window.tourneys.push({...event(), id: 42, planning: true});
  c.runCalendarSearches = async () => [{label: "Metro", local: true, error: "", truncated: false,
    sources: [URL_A], searchCount: 1, rejected: 2,
    skipped: [c.calendarSkip(event({name: "Bad date"}), "invalid date"), c.calendarSkip(event({name: "Missing source"}), "source not found in search results")],
    events: [event({buyin: 5000}), event({name: "New tournament"})]}];
  c.showCalendarSearchDetails = (items) => { c.details = items; };
  c.setCalUpdateStatus = (message) => { c.status = message; };
  c.showUndoToast = (message, undo) => { c.undo = undo; };
  await c.runCalendarUpdate();
  assert.match(c.status, /Added 1 event\(s\) · Updated 1 event\(s\)/);
  assert.match(c.status, /Skipped 2/);
  assert.equal(c.details.length, 2);
  assert.equal(c.details[0].name, "Bad date");
  assert.equal(c.details[0].reason, "invalid date");
  c.undo();
  assert.equal(c.window.tourneys.length, 1);
  assert.equal(c.window.tourneys[0].buyin, 3000);
  assert.equal(c.window.tourneys[0].planning, true);
});
