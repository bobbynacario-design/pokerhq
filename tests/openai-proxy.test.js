"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const P = require("../functions/openai-proxy.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// The exact request the calendar update sends (copied from the app's own source
// by executing it, so this test breaks if the two drift apart).
function realCalendarRequest() {
  const src = read("js/features/calendar.js");
  const sandbox = {
    window: {}, document: {getElementById: () => null}, localStorage: {getItem: () => null, setItem() {}},
    console, alert() {}, confirm: () => true, MONTH_SHORT_UPPER: [],
    hasOpenAIResponsesAccess: () => true, getOpenAIErrorMessage: async () => "x",
  };
  let captured = null;
  sandbox.callOpenAIResponses = async (body) => { captured = body; return {ok: true, json: async () => ({output_text: '{"asOf":"x","events":[]}', output: [], status: "completed"})}; };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.runOneCalendarSearch({label: "Metro", local: true, prompt: "Find events."}).then(() => captured);
}

test("the app's real calendar request passes validation", async () => {
  const body = await realCalendarRequest();
  assert.ok(body && body.model, "captured the request");
  const v = P.validateResponsesRequest(body);
  assert.equal(v.ok, true, v.message);
  assert.ok(P.RESPONSES_MODELS.has(body.model));
});

test("every OpenAI model the client references is allowed by the proxy", () => {
  const files = fs.readdirSync(path.join(root, "js/features")).map((f) => "js/features/" + f);
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/model:\s*'(gpt-[a-z0-9.\-]+)'/g)) {
      assert.ok(P.RESPONSES_MODELS.has(m[1]), `${f} sends ${m[1]} which the proxy would reject`);
    }
  }
  for (const m of read("js/features/hands.js").matchAll(/TRANSCRIBE_MODEL_OPTIONS\s*=\s*\[([^\]]*)\]/g)) {
    for (const t of m[1].matchAll(/'([^']+)'/g)) assert.ok(P.TRANSCRIBE_MODELS.has(t[1]), `transcribe model ${t[1]} not allowed`);
  }
});

const good = () => ({model: "gpt-5.6-terra", input: "hello", max_output_tokens: 4000, tools: [{type: "web_search"}], reasoning: {effort: "low"}, text: {verbosity: "low"}});

test("rejects models, fields, tools and sizes it should not relay", () => {
  const bad = (mutate, re) => {
    const b = good(); mutate(b);
    const v = P.validateResponsesRequest(b);
    assert.equal(v.ok, false, "should reject: " + JSON.stringify(b).slice(0, 80));
    if (re) assert.match(v.message, re);
  };
  bad((b) => { b.model = "gpt-4o"; }, /Model not permitted/);
  bad((b) => { b.stream = true; }, /Field not permitted/);
  bad((b) => { b.store = true; }, /Field not permitted/);
  bad((b) => { b.instructions = "x"; }, /Field not permitted/);
  bad((b) => { b.tools = [{type: "code_interpreter"}]; }, /web_search/);
  bad((b) => { b.tools = [{type: "web_search"}, {type: "web_search"}]; }, /one tool/i);
  bad((b) => { b.tools = [{type: "web_search", filters: {}}]; }, /web_search/);
  bad((b) => { b.max_output_tokens = 999999; }, /out of range/);
  bad((b) => { b.max_output_tokens = 0; }, /out of range/);
  bad((b) => { b.max_output_tokens = "4000"; }, /out of range/);
  bad((b) => { b.input = ""; }, /input/);
  bad((b) => { b.input = "x".repeat(30001); }, /too long/);
  bad((b) => { b.input = {role: "user"}; }, /input/);
  bad((b) => { b.reasoning = {effort: "extreme"}; }, /reasoning/i);
  bad((b) => { b.reasoning = {effort: "low", summary: "auto"}; }, /reasoning/i);
  bad((b) => { b.text = {verbosity: "loud"}; }, /verbosity/i);
  bad((b) => { b.text = {stop: ["x"]}; }, /text field/i);
  bad((b) => { b.text = {format: {type: "text"}}; }, /json_schema/);
  bad((b) => { b.text = {format: {type: "json_schema", name: "n", schema: {pad: "x".repeat(31000)}}}; }, /too large/);
  assert.equal(P.validateResponsesRequest(null).ok, false);
  assert.equal(P.validateResponsesRequest([]).ok, false);
  assert.equal(P.validateResponsesRequest("x").ok, false);
});

test("accepts the optional pieces the app uses", () => {
  const b = good();
  b.text = {verbosity: "low", format: {type: "json_schema", name: "poker_calendar_events", strict: true, schema: {type: "object"}}};
  assert.equal(P.validateResponsesRequest(b).ok, true);
  delete b.tools; delete b.reasoning; delete b.text;
  assert.equal(P.validateResponsesRequest(b).ok, true);
});

// ── transcription ──
const audio = (o) => Object.assign({audioBase64: Buffer.from("fake webm bytes").toString("base64"), mime: "audio/webm;codecs=opus", model: "gpt-4o-mini-transcribe", prompt: "poker"}, o);

test("transcription: accepts what the recorder produces", () => {
  for (const mime of ["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/mpeg"]) {
    assert.equal(P.validateTranscribeRequest(audio({mime})).ok, true, mime);
  }
  assert.equal(P.validateTranscribeRequest(audio({model: undefined})).model, "gpt-4o-mini-transcribe", "defaults the model");
  assert.equal(P.validateTranscribeRequest(audio({prompt: undefined})).ok, true);
});

test("transcription: rejects bad audio, types, models and oversize input", () => {
  const rej = (o, re) => { const v = P.validateTranscribeRequest(audio(o)); assert.equal(v.ok, false); if (re) assert.match(v.message, re); };
  rej({audioBase64: ""}, /No audio/);
  rej({audioBase64: "not base64 !!"}, /base64/);
  rej({audioBase64: "A".repeat(9000001)}, /too large/);
  rej({mime: "video/mp4"}, /audio type/);
  rej({mime: "audio/webm; rm -rf"}, /audio type/);
  rej({model: "gpt-4o"}, /Model not permitted/);
  rej({prompt: "x".repeat(2001)}, /prompt/);
  rej({prompt: 5}, /prompt/);
  assert.equal(P.validateTranscribeRequest(null).ok, false);
});

test("transcription form carries the audio, model and prompt", async () => {
  const data = audio();
  const form = P.buildTranscriptionForm(data, "whisper-1");
  assert.equal(form.get("model"), "whisper-1");
  assert.equal(form.get("prompt"), "poker");
  const file = form.get("file");
  assert.equal(file.name, "recording.webm");
  assert.equal(file.type, "audio/webm;codecs=opus");
  assert.equal(Buffer.from(await file.arrayBuffer()).toString(), "fake webm bytes");
  assert.equal(P.buildTranscriptionForm(audio({prompt: undefined}), "whisper-1").get("prompt"), null);
});

test("file extensions follow the mime type", () => {
  assert.equal(P.extensionForMime("audio/mp4"), "mp4");
  assert.equal(P.extensionForMime("audio/ogg;codecs=opus"), "ogg");
  assert.equal(P.extensionForMime("audio/mpeg"), "mp3");
  assert.equal(P.extensionForMime("audio/wav"), "wav");
  assert.equal(P.extensionForMime("audio/webm"), "webm");
  assert.equal(P.extensionForMime(undefined), "webm");
});

test("OpenAI errors map to callable codes and never blame a browser key that isn't involved", () => {
  const e401 = P.mapOpenAiError(401, "bad key");
  assert.equal(e401.code, "failed-precondition");
  assert.match(e401.message, /OPENAI_API_KEY secret/);
  assert.doesNotMatch(e401.message, /browser|this device/i);
  assert.equal(P.mapOpenAiError(429, "").code, "resource-exhausted");
  assert.equal(P.mapOpenAiError(400, "nope").code, "invalid-argument");
  assert.equal(P.mapOpenAiError(500, "boom").code, "internal");
  assert.ok(P.mapOpenAiError(500, "x".repeat(1000)).message.length < 400, "long upstream text is truncated");
});
