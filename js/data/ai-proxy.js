"use strict";

// Bridges PokerHQ's Anthropic-calling features to either the locally stored
// BYOK key (existing behavior, unchanged) or the pokerhqAiCall Cloud Function
// proxy (server-held key, functions/index.js) when no local key is set and
// the owner is signed in. callAnthropicMessages() returns a fetch-Response-
// shaped object ({ok, status, json()}) so callers' existing
// `if (!response.ok) ...` / `await response.json()` code needs no changes
// beyond swapping the fetch call for this function.

function hasAnthropicAccess() {
  var key = (typeof getStoredAnthropicKey === 'function') ? getStoredAnthropicKey() : '';
  return !!key || !!window.__pokerhqAuthUid;
}

// Read Anthropic's error payload before callers throw. The old callers only
// surfaced the HTTP status, which hid useful validation messages and made
// request regressions unnecessarily hard to diagnose.
async function getAnthropicErrorMessage(response, fallback) {
  var message = '';
  try {
    var data = await response.json();
    message = data && data.error && data.error.message ? String(data.error.message) : '';
  } catch (e) {}
  if (message.length > 400) message = message.slice(0, 397) + '...';
  return fallback + (message ? ': ' + message : ' (' + response.status + ')');
}

// Keyless access: signed in as the owner, the OpenAI features go through the
// pokerhqOpenAiCall Cloud Function (server-held key). A key saved on this
// device still wins, exactly like the Anthropic path below.
function hasOpenAIProxyAccess() {
  return !!window.__pokerhqAuthUid && typeof window.pokerhqOpenAiCall === 'function';
}

function hasOpenAIResponsesAccess() {
  var key = (typeof getStoredOpenAIKey === 'function') ? getStoredOpenAIKey() : '';
  return !!key || hasOpenAIProxyAccess();
}

// Cloud Function error → the fetch-Response-shaped object callers already handle.
function openAIProxyErrorResponse(err) {
  var code = err && err.code;
  var status = code === 'functions/permission-denied' ? 403
    : code === 'functions/unauthenticated' ? 401
    : code === 'functions/invalid-argument' ? 400
    : code === 'functions/not-found' ? 404
    : code === 'functions/failed-precondition' ? 412
    : code === 'functions/resource-exhausted' ? 429
    : code === 'functions/deadline-exceeded' ? 504
    : 500;
  var message = (err && err.message) || 'OpenAI proxy request failed.';
  if (code === 'functions/not-found') {
    message = 'The OpenAI server function is not deployed yet — add your OpenAI key in AI Assistant, or deploy the Cloud Functions.';
  } else if (code === 'functions/deadline-exceeded') {
    message = 'The OpenAI request took too long. Please try again.';
  }
  return { ok: false, status: status, json: function () { return Promise.resolve({ error: { message: message } }); } };
}

// payload: {kind:'responses'|'transcribe'|'ping', ...}. Resolves to a Response-like object.
async function callOpenAIProxy(payload, timeoutMs, timeoutMessage) {
  if (!hasOpenAIProxyAccess()) {
    return {
      ok: false,
      status: 401,
      json: function () { return Promise.resolve({ error: { message: 'Add your OpenAI API key in AI Assistant, or sign in with the owner account for keyless access.' } }); }
    };
  }
  var timer = null;
  try {
    var pending = window.pokerhqOpenAiCall(payload);
    var result = timeoutMs
      ? await Promise.race([
        pending,
        new Promise(function (_, reject) {
          timer = setTimeout(function () { var e = new Error(timeoutMessage || 'The OpenAI request timed out.'); e.code = 'timeout'; reject(e); }, timeoutMs);
        })
      ])
      : await pending;
    return { ok: true, status: 200, json: function () { return Promise.resolve(result.data); } };
  } catch (err) {
    if (err && err.code === 'timeout') {
      return { ok: false, status: 408, json: function () { return Promise.resolve({ error: { message: err.message } }); } };
    }
    return openAIProxyErrorResponse(err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function blobToBase64(blob) {
  var bytes = new Uint8Array(await blob.arrayBuffer());
  var binary = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

// Speech-to-text for voice hand capture. Local key → straight to OpenAI (as
// before); otherwise the recording goes up as base64 through the proxy.
async function callOpenAITranscription(blob, filename, model, prompt) {
  var key = (typeof getStoredOpenAIKey === 'function') ? getStoredOpenAIKey() : '';
  if (key) {
    var fd = new FormData();
    fd.append('file', blob, filename);
    fd.append('model', model);
    if (prompt) fd.append('prompt', prompt);
    return fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key },
      body: fd
    });
  }
  if (!hasOpenAIProxyAccess()) return callOpenAIProxy({}, 0);
  var audioBase64 = await blobToBase64(blob);
  return callOpenAIProxy({ kind: 'transcribe', audioBase64: audioBase64, mime: blob.type || 'audio/webm', model: model, prompt: prompt || undefined }, 120000, 'Transcription timed out. Please try again.');
}

async function getOpenAIErrorMessage(response, fallback) {
  var message = '';
  try {
    var data = await response.json();
    message = data && data.error && data.error.message ? String(data.error.message) : '';
  } catch (e) {}
  if (message.length > 400) message = message.slice(0, 397) + '...';
  return fallback + (message ? ': ' + message : ' (' + response.status + ')');
}

async function callOpenAIResponses(bodyObj, options) {
  var key = (typeof getStoredOpenAIKey === 'function') ? getStoredOpenAIKey() : '';
  var timeoutMs = options && options.timeoutMs ? Number(options.timeoutMs) : 0;
  if (!key) {
    return callOpenAIProxy({ kind: 'responses', body: bodyObj }, timeoutMs, 'The OpenAI event search timed out. Please try again.');
  }
  var controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
  try {
    return await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify(bodyObj),
      signal: controller ? controller.signal : undefined
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      return {
        ok: false,
        status: 408,
        json: function () { return Promise.resolve({ error: { message: 'The OpenAI event search timed out. Please try again.' } }); }
      };
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callAnthropicMessages(bodyObj, options) {
  var timeoutMs = options && options.timeoutMs ? Number(options.timeoutMs) : 0;
  var key = (typeof getStoredAnthropicKey === 'function') ? getStoredAnthropicKey() : '';
  if (key) {
    var controller = timeoutMs && typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, timeoutMs) : null;
    try {
      return await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(bodyObj),
        signal: controller ? controller.signal : undefined
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          json: function () { return Promise.resolve({ error: { message: 'The AI search timed out. Please try again.' } }); }
        };
      }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  if (!window.__pokerhqAuthUid || typeof window.pokerhqAiCall !== 'function') {
    return {
      ok: false,
      status: 401,
      json: function () { return Promise.resolve({ error: { message: 'Add your Anthropic API key, or sign in with the owner account for keyless AI access.' } }); }
    };
  }
  try {
    var proxyCall = window.pokerhqAiCall(bodyObj);
    var result = timeoutMs
      ? await Promise.race([
        proxyCall,
        new Promise(function (_, reject) {
          setTimeout(function () { reject(new Error('The AI search timed out. Please try again.')); }, timeoutMs);
        })
      ])
      : await proxyCall;
    return { ok: true, status: 200, json: function () { return Promise.resolve(result.data); } };
  } catch (err) {
    var code = err && err.code;
    var status = code === 'functions/permission-denied' ? 403
      : code === 'functions/unauthenticated' ? 401
      : code === 'functions/invalid-argument' ? 400
      : code === 'functions/not-found' ? 404
      : 500;
    var message = (err && err.message) || 'AI proxy request failed.';
    return { ok: false, status: status, json: function () { return Promise.resolve({ error: { message: message } }); } };
  }
}
