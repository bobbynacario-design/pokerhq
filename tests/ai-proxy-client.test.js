"use strict";
// Client side of the OpenAI proxy (js/data/ai-proxy.js): local key wins,
// otherwise signed-in owners go through the Cloud Function; every failure comes
// back in the shape the callers already handle.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = fs.readFileSync(path.join(__dirname, "..", "js/data/ai-proxy.js"), "utf8");

function load(opts) {
  const o = opts || {};
  const calls = {fetch: [], proxy: []};
  const sandbox = {
    console, setTimeout, clearTimeout, AbortController, FormData, Blob, btoa,
    window: {__pokerhqAuthUid: o.signedIn === false ? null : "uid1"},
    fetch: async (url, init) => { calls.fetch.push({url, init}); return {ok: true, status: 200, json: async () => ({direct: true})}; },
  };
  if (o.proxy !== false) {
    sandbox.window.pokerhqOpenAiCall = o.proxyImpl || (async (payload) => { calls.proxy.push(payload); return {data: {proxied: true, kind: payload.kind}}; });
  }
  if (o.key) sandbox.getStoredOpenAIKey = () => o.key;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {sb: sandbox, calls};
}
const errOf = async (res) => (await res.json()).error.message;
// objects built inside the vm sandbox have a different Object.prototype, so compare as plain JSON
const plain = (v) => JSON.parse(JSON.stringify(v));
const fbErr = (code, message) => Object.assign(new Error(message || code), {code});

test("a key saved on this device goes straight to OpenAI, never the proxy", async () => {
  const {sb, calls} = load({key: "sk-local"});
  assert.equal(sb.hasOpenAIResponsesAccess(), true);
  const res = await sb.callOpenAIResponses({model: "gpt-5.6-terra", input: "x"}, {});
  assert.equal(res.ok, true);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.fetch[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls.fetch[0].init.headers.Authorization, "Bearer sk-local");
  assert.equal(calls.proxy.length, 0);
});

test("no key but signed in: the request goes through the proxy and returns its data", async () => {
  const {sb, calls} = load();
  assert.equal(sb.hasOpenAIResponsesAccess(), true);
  const body = {model: "gpt-5.6-terra", input: "find events", max_output_tokens: 6000};
  const res = await sb.callOpenAIResponses(body, {timeoutMs: 5000});
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.deepEqual(plain(await res.json()), {proxied: true, kind: "responses"});
  assert.deepEqual(plain(calls.proxy[0]), {kind: "responses", body});
  assert.equal(calls.fetch.length, 0, "nothing sent to OpenAI directly");
});

test("no key and signed out: a clear 401 that says how to fix it", async () => {
  const {sb, calls} = load({signedIn: false});
  assert.equal(sb.hasOpenAIResponsesAccess(), false);
  const res = await sb.callOpenAIResponses({model: "m", input: "x"}, {});
  assert.equal(res.ok, false);
  assert.equal(res.status, 401);
  assert.match(await errOf(res), /OpenAI API key.*owner account/i);
  assert.equal(calls.proxy.length + calls.fetch.length, 0);
});

test("signed in but the proxy function isn't available: same 401 path", async () => {
  const {sb} = load({proxy: false});
  assert.equal(sb.hasOpenAIResponsesAccess(), false);
  assert.equal((await sb.callOpenAIResponses({}, {})).status, 401);
});

test("proxy errors map to statuses and readable messages", async () => {
  const cases = [
    ["functions/permission-denied", 403, /Not authorized/, "Not authorized"],
    ["functions/unauthenticated", 401, /Sign in/, "Sign in"],
    ["functions/invalid-argument", 400, /Model not permitted/, "Model not permitted through this proxy: gpt-4o"],
    ["functions/failed-precondition", 412, /OPENAI_API_KEY/, "The server's OpenAI key was rejected (401) — update the OPENAI_API_KEY secret"],
    ["functions/resource-exhausted", 429, /quota/i, "OpenAI rate limit or quota reached"],
    ["functions/internal", 500, /boom/, "boom"],
  ];
  for (const [code, status, re, message] of cases) {
    const {sb} = load({proxyImpl: async () => { throw fbErr(code, message); }});
    const res = await sb.callOpenAIResponses({}, {});
    assert.equal(res.ok, false, code);
    assert.equal(res.status, status, code);
    assert.match(await errOf(res), re, code);
  }
});

test("a function that isn't deployed yet says so instead of a cryptic 404", async () => {
  const {sb} = load({proxyImpl: async () => { throw fbErr("functions/not-found", "NOT_FOUND"); }});
  const res = await sb.callOpenAIResponses({}, {});
  assert.equal(res.status, 404);
  assert.match(await errOf(res), /not deployed/i);
  assert.match(await errOf(res), /add your OpenAI key/i);
});

test("deadline exceeded and client timeouts are reported plainly", async () => {
  const slow = load({proxyImpl: async () => { throw fbErr("functions/deadline-exceeded", "x"); }});
  const r1 = await slow.sb.callOpenAIResponses({}, {});
  assert.equal(r1.status, 504);
  assert.match(await errOf(r1), /took too long/);

  const hang = load({proxyImpl: () => new Promise(() => {})});
  const r2 = await hang.sb.callOpenAIResponses({}, {timeoutMs: 30});
  assert.equal(r2.status, 408);
  assert.match(await errOf(r2), /timed out/i);
});

// ── transcription ──
const blobOf = (text, type) => new Blob([Buffer.from(text)], {type: type || "audio/webm;codecs=opus"});

test("transcription with a local key uploads multipart straight to OpenAI", async () => {
  const {sb, calls} = load({key: "sk-local"});
  const res = await sb.callOpenAITranscription(blobOf("abc"), "recording.webm", "whisper-1", "poker terms");
  assert.equal(res.ok, true);
  assert.equal(calls.fetch[0].url, "https://api.openai.com/v1/audio/transcriptions");
  const fd = calls.fetch[0].init.body;
  assert.equal(fd.get("model"), "whisper-1");
  assert.equal(fd.get("prompt"), "poker terms");
  assert.equal(fd.get("file").name, "recording.webm");
  assert.equal(calls.proxy.length, 0);
});

test("transcription without a key sends base64 audio through the proxy", async () => {
  const {sb, calls} = load();
  const res = await sb.callOpenAITranscription(blobOf("hello audio", "audio/mp4"), "recording.mp4", "gpt-4o-mini-transcribe", "terms");
  assert.equal(res.ok, true);
  assert.equal(calls.fetch.length, 0);
  const p = calls.proxy[0];
  assert.equal(p.kind, "transcribe");
  assert.equal(p.mime, "audio/mp4");
  assert.equal(p.model, "gpt-4o-mini-transcribe");
  assert.equal(p.prompt, "terms");
  assert.equal(Buffer.from(p.audioBase64, "base64").toString(), "hello audio");
});

test("base64 handles recordings bigger than one chunk without blowing the stack", async () => {
  const {sb} = load();
  const big = Buffer.alloc(300000, 7);
  const b64 = await sb.blobToBase64(new Blob([big]));
  assert.equal(Buffer.from(b64, "base64").length, 300000);
  assert.ok(Buffer.from(b64, "base64").equals(big));
});

test("transcription signed out and keyless returns the 401 guidance", async () => {
  const {sb} = load({signedIn: false});
  const res = await sb.callOpenAITranscription(blobOf("x"), "r.webm", "whisper-1", "");
  assert.equal(res.status, 401);
  assert.match(await errOf(res), /owner account/i);
});
