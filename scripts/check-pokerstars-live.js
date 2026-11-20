"use strict";

// Opt-in live regression check. Uses the production research functions, an
// in-memory calendar, and a server key supplied through the environment. No
// Firebase data is read or written, and credentials are never printed.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const os = require("node:os");

(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY to run this opt-in live check.");
  const root = path.join(__dirname, "..");
  const context = {URL, console, window: {tourneys: []}, localStorage: {getItem: () => null}, save() {}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "js/features/calendar.js"), "utf8"), context);
  let requestNumber = 0;
  let discoveredSchedules = [];
  context.callOpenAIResponses = async (body, options) => {
    const id = ++requestNumber;
    const label = body.text.format.schema.properties.schedules ? "index discovery" : "schedule extraction";
    console.log("Request " + id + ": " + label);
    const check = require("../functions/openai-proxy.js").validateResponsesRequest(body);
    assert.ok(check.ok, check.message);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: {Authorization: "Bearer " + key, "Content-Type": "application/json"},
      body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs)
    });
    const data = await response.json();
    if (!response.ok) throw new Error("Live research request returned HTTP " + response.status);
    if (body.text.format.schema.properties.schedules) {
      const text = data.output_text || (data.output || []).flatMap((item) => item.content || [])
        .filter((item) => item.type === "output_text").map((item) => item.text).join('\n');
      discoveredSchedules = JSON.parse(text).schedules;
    }
    console.log(JSON.stringify({request: id, status: data.status, actions: (data.output || [])
      .filter((item) => item.type === "web_search_call").map((item) => ({type: item.action?.type, url: item.action?.url}))}));
    return {ok: true, json: async () => data};
  };
  const venue = context.CALENDAR_MANILA_SEARCHES.find((item) => item.indexUrl);
  const result = await context.runCalendarIndexSearch({...venue, local: true,
    windowDates: context.calendarResearchWindow(), prompt: context.buildCalendarVenuePrompt(venue)});
  context.renderCalendar = () => {};
  const report = context.importCalendarUpdateEvents(result.events, {research: true,
    sources: new Set(result.sources), windowDates: context.calendarResearchWindow()});
  const perSchedule = Object.fromEntries(discoveredSchedules.map((schedule) => [schedule.name,
    report.added.filter((event) => context.calendarSourceKey(event.url) === context.calendarSourceKey(schedule.url)).length]));
  const outputFile = path.join(os.tmpdir(), 'pokerhq-pokerstars-live-check.json');
  fs.writeFileSync(outputFile, JSON.stringify({result, report, discoveredSchedules}, null, 2));
  console.log(JSON.stringify({events: result.events.length, requests: requestNumber,
    importedInMemory: report.added.length, perSchedule, importSkips: report.skipped,
    skippedCount: result.skipped.length, error: result.error, outputFile,
    sample: result.events.slice(0, 6)}, null, 2));
  assert.equal(result.error, "");
  assert.ok(result.events.length > 0, "No Okada events passed live research and source validation");
  assert.ok(report.added.length > 0, "No Okada events passed the calendar import checks");
  for (const [schedule, count] of Object.entries(perSchedule)) assert.ok(count > 0, 'No events imported from ' + schedule);
  assert.ok(result.events.every((event) => event.url.startsWith(venue.indexUrl) && event.buyin >= 0));
  console.log("Live PokerStars research check passed; no calendar data was changed.");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
