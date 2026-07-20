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

async function callAnthropicMessages(bodyObj) {
  var key = (typeof getStoredAnthropicKey === 'function') ? getStoredAnthropicKey() : '';
  if (key) {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(bodyObj)
    });
  }
  if (!window.__pokerhqAuthUid || typeof window.pokerhqAiCall !== 'function') {
    return {
      ok: false,
      status: 401,
      json: function () { return Promise.resolve({ error: { message: 'Add your Anthropic API key, or sign in with the owner account for keyless AI access.' } }); }
    };
  }
  try {
    var result = await window.pokerhqAiCall(bodyObj);
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
