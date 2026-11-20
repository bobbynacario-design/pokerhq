"use strict";

// Opt-in real-API check of Manila room research, excluding the separately tested
// PokerStars index flow. Uses an in-memory calendar and never prints the key.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const proxy = require("../functions/openai-proxy.js");

(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Set OPENAI_API_KEY to run this opt-in check.");
  const context = {URL, console, window: {tourneys: []}, localStorage: {getItem: () => null}, save() {}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/features/calendar.js"), "utf8"), context);
  context.renderCalendar = () => {};
  const rooms = context.CALENDAR_MANILA_SEARCHES.filter((room) => !room.indexUrl);
  const counts = {};
  context.getOpenAIErrorMessage = async (response) => "Live API returned HTTP " + response.status;
  context.callOpenAIResponses = async (body, options) => {
    const room = rooms.find((room) => body.input.includes(room.query));
    const label = room ? room.label : "Room research";
    counts[label] = (counts[label] || 0) + 1;
    const attempt = counts[label];
    const check = proxy.validateResponsesRequest(body);
    assert.ok(check.ok, check.message);
    console.log(label + ": request " + attempt);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: {Authorization: "Bearer " + key, "Content-Type": "application/json"},
      body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs)
    });
    const data = await response.json();
    console.log(JSON.stringify({room: label, attempt, status: data.status || response.status,
      opened: (data.output || []).filter((item) => item.type === "web_search_call" && item.action?.type === "open_page")
        .map((item) => item.action.url)}));
    return {ok: response.ok, status: response.status, json: async () => data};
  };
  const windowDates = context.calendarResearchWindow();
  const results = await context.runCalendarSearches(rooms.map((room) => ({...room, roomSearch: true,
    local: true, windowDates, prompt: context.buildCalendarVenuePrompt(room)})), 3);
  const events = results.flatMap((result) => result.events);
  const report = context.importCalendarUpdateEvents(events, {research: true,
    sources: new Set(results.flatMap((result) => result.sources)), windowDates});
  const outputFile = path.join(os.tmpdir(), "pokerhq-manila-live-check.json");
  fs.writeFileSync(outputFile, JSON.stringify({windowDates, results, report}, null, 2));
  console.log(JSON.stringify({windowDates, importedInMemory: report.added.length, importSkips: report.skipped,
    rooms: results.map((result) => ({room: result.label, events: result.events.length, requests: counts[result.label],
      error: result.error, skipped: result.skipped.map((item) => ({name: item.name, date: item.date, reason: item.reason}))})),
    outputFile, events: report.added.map((event) => ({name: event.name, date: event.date, buyin: event.buyin, url: event.url}))}, null, 2));
  assert.ok(results.every((result) => !result.error), "A room research request failed; inspect the saved report");
  for (const expected of [{date: "2026-12-09", name: /Christmas/i, cost: 11000},
    {date: "2027-01-04", name: /Million Showdown/i, cost: 1500}]) {
    if (expected.date < windowDates.from || expected.date > windowDates.to) continue;
    assert.ok(report.added.some((event) => expected.name.test(event.name) && event.date === expected.date && event.buyin === expected.cost),
      "Missing verified Metro schedule row for " + expected.date + " with the total entry fee");
  }
  console.log("Live Manila research check passed; saved calendar data was not changed.");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
