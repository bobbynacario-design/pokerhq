"use strict";

const fs = require("fs");
const vm = require("vm");

global.window = {};
vm.runInThisContext(fs.readFileSync("js/data/ai-proxy.js", "utf8"));

(async () => {
  const message = await getAnthropicErrorMessage({
    status: 400,
    json: async () => ({
      error: {message: "citations are incompatible with structured outputs"},
    }),
  }, "Claude API error");

  if (message !== "Claude API error: citations are incompatible with structured outputs") {
    throw new Error("Anthropic error details were not preserved: " + message);
  }

  global.getStoredAnthropicKey = () => "test-key";
  global.fetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
  const timedOut = await callAnthropicMessages({messages: []}, {timeoutMs: 5});
  if (timedOut.status !== 408) {
    throw new Error("Direct Anthropic requests do not stop at the configured timeout");
  }

  global.getStoredOpenAIKey = () => "test-openai-key";
  const openAiTimedOut = await callOpenAIResponses({input: "test"}, {timeoutMs: 5});
  if (openAiTimedOut.status !== 408) {
    throw new Error("Direct OpenAI Responses requests do not stop at the configured timeout");
  }

  ["js/features/strategy.js"].forEach((file) => {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes("output_config")) {
      throw new Error(file + " combines structured output with cited web search");
    }
    if (!source.includes("Respond with ONLY a single valid JSON object")) {
      throw new Error(file + " is missing JSON-only response instructions");
    }
  });

  const calendarSource = fs.readFileSync("js/features/calendar.js", "utf8");
  ["Metro Card Club", "PRIME Poker Club Manila", "Masters Poker Club", "Soul Poker Club"].forEach((venue) => {
    if (!calendarSource.includes(venue)) {
      throw new Error("Calendar research prompt is missing priority venue: " + venue);
    }
  });
  if (!calendarSource.includes("model: 'gpt-5.6-terra'") ||
      !calendarSource.includes("type: 'web_search'") ||
      !calendarSource.includes("type: 'json_schema'") ||
      !calendarSource.includes("callOpenAIResponses") ||
      !calendarSource.includes("timeoutMs: 120000")) {
    throw new Error("Calendar research request is not configured for OpenAI web search");
  }

  console.log("AI request compatibility checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
