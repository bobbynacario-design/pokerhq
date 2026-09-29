"use strict";

// Pure helpers for pokerhqOpenAiCall (index.js) — the owner-only OpenAI proxy
// that lets the calendar update and voice capture work without pasting an API
// key on every device. No Firebase imports so it is unit-testable
// (tests/openai-proxy.test.js).
//
// The proxy must not become a general-purpose OpenAI relay for the owner's key,
// so requests are checked against strict allowlists of exactly what the app
// sends. If the app starts sending something new, add it here AND to the test —
// tests/ai-config.test.js also fails when a client model is not allowed.

const RESPONSES_MODELS = new Set(["gpt-5.6-terra"]);
const TRANSCRIBE_MODELS = new Set(["gpt-4o-mini-transcribe", "gpt-4o-transcribe", "whisper-1"]);
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-mini-transcribe";

const RESPONSES_KEYS = new Set(["model", "input", "reasoning", "tools", "max_output_tokens", "text"]);
const MAX_OUTPUT_TOKENS_CEILING = 12000;
const MAX_INPUT_CHARS = 30000;
const MAX_SCHEMA_JSON_CHARS = 30000;
const REASONING_EFFORTS = new Set(["minimal", "low", "medium", "high"]);
const VERBOSITIES = new Set(["low", "medium", "high"]);

// Callable requests are capped at 10 MB including JSON; base64 inflates audio by
// a third, so a hand recap of a few minutes fits comfortably.
const MAX_AUDIO_BASE64_CHARS = 9000000;
const MAX_TRANSCRIBE_PROMPT_CHARS = 2000;

function isObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function fail(message) {
  return {ok: false, message};
}

// body = the Responses API request the browser would have sent to OpenAI.
function validateResponsesRequest(body) {
  if (!isObject(body)) return fail("Malformed OpenAI request body.");
  for (const key of Object.keys(body)) {
    if (!RESPONSES_KEYS.has(key)) return fail("Field not permitted through this proxy: " + key);
  }
  if (!RESPONSES_MODELS.has(body.model)) return fail("Model not permitted through this proxy: " + body.model);
  if (typeof body.input !== "string" || !body.input.length) return fail("input must be a non-empty string.");
  if (body.input.length > MAX_INPUT_CHARS) return fail("input is too long.");
  if (typeof body.max_output_tokens !== "number" || !(body.max_output_tokens > 0) ||
      body.max_output_tokens > MAX_OUTPUT_TOKENS_CEILING) {
    return fail("max_output_tokens out of range.");
  }

  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length > 1) return fail("Only one tool is permitted.");
    for (const tool of body.tools) {
      if (!isObject(tool) || tool.type !== "web_search" || Object.keys(tool).length !== 1) {
        return fail("Only the web_search tool is permitted.");
      }
    }
  }

  if (body.reasoning !== undefined) {
    if (!isObject(body.reasoning) || Object.keys(body.reasoning).some((k) => k !== "effort") ||
        !REASONING_EFFORTS.has(body.reasoning.effort)) {
      return fail("Unsupported reasoning setting.");
    }
  }

  if (body.text !== undefined) {
    if (!isObject(body.text)) return fail("Unsupported text setting.");
    for (const key of Object.keys(body.text)) {
      if (key !== "verbosity" && key !== "format") return fail("Unsupported text field: " + key);
    }
    if (body.text.verbosity !== undefined && !VERBOSITIES.has(body.text.verbosity)) {
      return fail("Unsupported text verbosity.");
    }
    if (body.text.format !== undefined) {
      const f = body.text.format;
      if (!isObject(f) || f.type !== "json_schema" || typeof f.name !== "string" || !isObject(f.schema)) {
        return fail("Only json_schema output formats are permitted.");
      }
      if (JSON.stringify(f.schema).length > MAX_SCHEMA_JSON_CHARS) return fail("Output schema is too large.");
    }
  }
  return {ok: true};
}

// audio/<subtype> with optional `; name=value` parameters, e.g. audio/webm;codecs=opus
const AUDIO_MIME_RE = /^audio\/[a-z0-9.+-]+(;\s*[a-z0-9._-]+=[a-z0-9._+,-]+)*$/i;

// data = {audioBase64, mime, model?, prompt?} sent by the browser.
function validateTranscribeRequest(data) {
  if (!isObject(data)) return fail("Malformed transcription request.");
  if (typeof data.audioBase64 !== "string" || !data.audioBase64.length) return fail("No audio was sent.");
  if (data.audioBase64.length > MAX_AUDIO_BASE64_CHARS) return fail("Recording is too large — keep it under a few minutes.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data.audioBase64)) return fail("Audio is not valid base64.");
  if (typeof data.mime !== "string" || !AUDIO_MIME_RE.test(data.mime)) return fail("Unsupported audio type.");
  const model = data.model === undefined ? DEFAULT_TRANSCRIBE_MODEL : data.model;
  if (!TRANSCRIBE_MODELS.has(model)) return fail("Model not permitted through this proxy: " + model);
  if (data.prompt !== undefined &&
      (typeof data.prompt !== "string" || data.prompt.length > MAX_TRANSCRIBE_PROMPT_CHARS)) {
    return fail("Transcription prompt is invalid or too long.");
  }
  return {ok: true, model};
}

function extensionForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "mp4";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  return "webm";
}

// Multipart body for POST /v1/audio/transcriptions.
function buildTranscriptionForm(data, model) {
  const bytes = Buffer.from(data.audioBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([bytes], {type: data.mime}), "recording." + extensionForMime(data.mime));
  form.append("model", model);
  if (data.prompt) form.append("prompt", data.prompt);
  return form;
}

// Map an OpenAI error status to a callable error code + a message that doesn't
// send the owner hunting for a browser key that isn't involved.
function mapOpenAiError(status, message) {
  const detail = message ? ": " + String(message).slice(0, 300) : "";
  if (status === 401 || status === 403) {
    return {code: "failed-precondition", message: "The server's OpenAI key was rejected (" + status + ") — update the OPENAI_API_KEY secret" + detail};
  }
  if (status === 429) return {code: "resource-exhausted", message: "OpenAI rate limit or quota reached" + detail};
  if (status === 400 || status === 404 || status === 422) return {code: "invalid-argument", message: "OpenAI rejected the request" + detail};
  return {code: "internal", message: "OpenAI API error (" + status + ")" + detail};
}

module.exports = {
  RESPONSES_MODELS,
  TRANSCRIBE_MODELS,
  MAX_OUTPUT_TOKENS_CEILING,
  validateResponsesRequest,
  validateTranscribeRequest,
  extensionForMime,
  buildTranscriptionForm,
  mapOpenAiError,
};
