import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import {
  firebaseConfig,
  FIRESTORE_KEYS,
  resolveProfileConfig,
  resolveLocalStorageKey
} from "./config.js?v=20260930k";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// Region must match functions/index.js's pokerhqAiCall deployment region.
// Bridges the callable to plain window scope so classic (non-module) feature
// scripts (js/data/ai-proxy.js) can call it without their own SDK import.
// Web-search calls can run for a minute or more; the SDK default is 70s.
const AI_CALL_TIMEOUT_MS = 300000;
window.pokerhqAiCall = httpsCallable(getFunctions(app, "asia-southeast1"), "pokerhqAiCall", { timeout: AI_CALL_TIMEOUT_MS });
window.pokerhqOpenAiCall = httpsCallable(getFunctions(app, "asia-southeast1"), "pokerhqOpenAiCall", { timeout: AI_CALL_TIMEOUT_MS });
// Phone notifications: enable/disable this device, send a test (functions/index.js pokerhqPush).
window.pokerhqPushCall = httpsCallable(getFunctions(app, "asia-southeast1"), "pokerhqPush", { timeout: 60000 });

let resolvedProfile = null;
let unsubscribeListeners = [];

function getResolvedProfile() {
  if (!resolvedProfile) resolvedProfile = resolveProfileConfig();
  return resolvedProfile;
}

function getLocalStorageKey(key) {
  return resolveLocalStorageKey(key, getResolvedProfile());
}

function getFirestoreDocKey(key) {
  const profile = getResolvedProfile();
  const prefix = String((profile && profile.firestoreDocPrefix) || "");
  return prefix + key;
}

// Firestore key → the window global that holds it in the app.
const WINDOW_VAR = { news: "newsItems" };
function windowVarFor(key) { return WINDOW_VAR[key] || key; }

// Keys whose value is a list of records (each with an id). These are merged
// record-by-record on save so one device can't overwrite another's additions —
// see js/data/merge.js. Everything else is a small single value (last write wins).
const MERGE_KEYS = [
  "sessions", "tourneys", "hands", "strategies", "news",
  "spotlights", "walletLedger", "satellites", "opponents", "trips", "tripExpenses"
];

// Firestore rejects documents near 1 MiB. Large logical lists are transparently
// stored as a manifest plus conservative 180k-character chunks. Existing
// single-document profiles continue to load unchanged.
const SHARD_THRESHOLD_BYTES = 700000;
const SHARD_CHARS = 180000;
const shardedKeys = new Set();

function byteLength(text) {
  return typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : unescape(encodeURIComponent(text)).length;
}
function shardDocKey(key, suffix) { return getFirestoreDocKey(key) + "__" + suffix; }
function shardParts(value) {
  const text = JSON.stringify(value), parts = [];
  for (let i = 0; i < text.length; i += SHARD_CHARS) parts.push(text.slice(i, i + SHARD_CHARS));
  return { text, parts };
}
function parseShardSnapshots(snaps) {
  try { return JSON.parse(snaps.map(function(s) { return s.exists() ? String(s.data().value || "") : ""; }).join("")); } catch { return undefined; }
}

function applyLoadedValue(key, value) {
  if (key === "sessions" && typeof window.normalizeSessions === "function") window.normalizeSessions(value);
  if (key === "sessions") window.sessions = value;
  if (key === "tourneys") window.tourneys = value;
  if (key === "hands") window.hands = value;
  if (key === "strategies") window.strategies = value;
  if (key === "news") window.newsItems = value;
  if (key === "spotlights") window.spotlights = value;
  if (key === "bankroll") window.bankroll = value;
  if (key === "wallet") window.wallet = value;
  if (key === "walletLedger") window.walletLedger = value;
  if (key === "satellites") window.satellites = value;
  if (key === "trips") window.trips = value;
  if (key === "tripExpenses") window.tripExpenses = value;
  if (key === "opponents") window.opponents = value;
  if (key === "satTarget") window.satTarget = value;
  if (key === "goals") window.goals = value;
  if (key === "reminderSettings") { window.reminderSettings = value; if (window.renderReminderSettings) window.renderReminderSettings(); }
  if (key === "drillState") { window.drillState = value; if (window.renderDailyDrill) window.renderDailyDrill(); }
  if (key === "reviewState") { window.reviewState = value; if (window.refreshInbox) window.refreshInbox(); }
  if (window.syncGlobalAliases) window.syncGlobalAliases();
  if (key === "timer" && window.restoreTimerState) window.restoreTimerState(value);
  localStorage.setItem(getLocalStorageKey(key), JSON.stringify(value));
}

function refreshAllUi() {
  if (window.refreshDashboard) window.refreshDashboard();
  if (window.renderCalendarMonth) window.renderCalendarMonth();
  if (window.renderCalendarList) window.renderCalendarList();
  if (window.renderStrategy) window.renderStrategy();
  if (window.renderHands) window.renderHands();
  if (window.loadBankrollForm) window.loadBankrollForm();
  if (window.renderTreasury) window.renderTreasury();
  if (window.populateSessionDropdowns) window.populateSessionDropdowns();
  if (window.renderSatellites) window.renderSatellites();
  if (window.renderOpponents) window.renderOpponents();
  if (window.renderActiveSessionSurface) window.renderActiveSessionSurface();
}

function refreshRealtimeUi(keys) {
  if (window.refreshDashboard) window.refreshDashboard();
  if (window.loadBankrollForm) window.loadBankrollForm();
  if (window.renderTreasury) window.renderTreasury();
  if (window.renderCalendarMonth) window.renderCalendarMonth();
  if (window.renderCalendarList) window.renderCalendarList();
  if (window.renderStrategy) window.renderStrategy();
  if (window.renderHands) window.renderHands();
  if (keys.has("satellites") && window.renderSatellites) window.renderSatellites();
  if (keys.has("opponents") && window.renderOpponents) window.renderOpponents();
  if (window.renderActiveSessionSurface) window.renderActiveSessionSurface();
}

// Fifteen listeners deliver their first snapshot back-to-back on load, and each
// used to re-render the whole UI. Coalesce a burst into one refresh.
let pendingRefreshKeys = new Set();
let refreshTimer = null;
function scheduleRealtimeRefresh(key) {
  pendingRefreshKeys.add(key);
  if (refreshTimer) return;
  refreshTimer = setTimeout(function() {
    const keys = pendingRefreshKeys;
    pendingRefreshKeys = new Set();
    refreshTimer = null;
    try {
      refreshRealtimeUi(keys);
    } catch (error) {
      console.error("refreshRealtimeUi error:", error);
    }
  }, 60);
}

export function setSyncStatus(status, msg, extra) {
  window._syncMeta = Object.assign({ status, msg, updated: Date.now() }, extra || {});
  const el = document.getElementById("sync-status");
  if (!el) return;
  const colors = {
    syncing: "var(--amber)",
    ok: "var(--green)",
    error: "var(--red)",
    offline: "var(--wa-30)"
  };
  const icons = {
    syncing: "⟳",
    ok: "✓",
    error: "✗",
    offline: "○"
  };
  el.textContent = (icons[status] || "○") + " " + msg;
  el.style.color = colors[status] || "var(--wa-30)";
  if (window.renderReliability) window.renderReliability();
}

function getFirestorePath() {
  return getResolvedProfile().firestorePath;
}

// ── record-level sync ──────────────────────────────────────────────────────
// The engine (js/data/merge.js) holds the merge/queue logic; this file supplies
// Firestore and localStorage. `base` is a compact {recordKey: hash} map of the
// cloud copy this device last saw, kept per key in localStorage.
function readSyncBase(key) {
  try {
    const raw = localStorage.getItem(getLocalStorageKey("syncbase_" + key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSyncBase(key, map) {
  try {
    localStorage.setItem(getLocalStorageKey("syncbase_" + key), JSON.stringify(map));
  } catch (error) {
    // Out of space: without a base the next merge falls back to a safe union.
    console.warn("Could not store sync base for", key, error);
  }
}

function parseStoredValue(snap) {
  try {
    return JSON.parse(snap.data().value);
  } catch {
    return undefined;
  }
}

const firestoreIo = {
  // Read the cloud copy and (maybe) replace it atomically. fn(remote) → {value, write}.
  async transact(key, fn) {
    const ref = doc(db, getFirestorePath(), getFirestoreDocKey(key));
    const manifestRef = doc(db, getFirestorePath(), shardDocKey(key, "manifest"));
    let result;
    await runTransaction(db, async function(tx) {
      const snaps = await Promise.all([tx.get(ref), tx.get(manifestRef)]);
      const snap = snaps[0], manifest = snaps[1];
      let remote = snap.exists() ? parseStoredValue(snap) : undefined;
      if (manifest.exists() && manifest.data().sharded === 1) {
        const count = Math.max(0, Number(manifest.data().count) || 0);
        const chunks = await Promise.all(Array.from({length: count}, function(_, i) { return tx.get(doc(db, getFirestorePath(), shardDocKey(key, "chunk_" + i))); }));
        remote = parseShardSnapshots(chunks);
      }
      result = fn(remote);
      if (!result.write) return;
      const split = shardParts(result.value);
      if (manifest.exists() || byteLength(split.text) > SHARD_THRESHOLD_BYTES) {
        split.parts.forEach(function(part, i) { tx.set(doc(db, getFirestorePath(), shardDocKey(key, "chunk_" + i)), { value: part, updated: Date.now() }); });
        tx.set(manifestRef, { sharded: 1, count: split.parts.length, updated: Date.now() });
        shardedKeys.add(key);
      } else tx.set(ref, { value: split.text, updated: Date.now() });
    });
    return result.value;
  },
  async write(key, value) {
    const split = shardParts(value);
    if (byteLength(split.text) <= SHARD_THRESHOLD_BYTES && !shardedKeys.has(key)) {
      await setDoc(doc(db, getFirestorePath(), getFirestoreDocKey(key)), { value: split.text, updated: Date.now() });
      return;
    }
    await runTransaction(db, async function(tx) {
      split.parts.forEach(function(part, i) { tx.set(doc(db, getFirestorePath(), shardDocKey(key, "chunk_" + i)), { value: part, updated: Date.now() }); });
      tx.set(doc(db, getFirestorePath(), shardDocKey(key, "manifest")), { sharded: 1, count: split.parts.length, updated: Date.now() });
    });
    shardedKeys.add(key);
  }
};

async function readCloudValue(key) {
  const refs = [doc(db, getFirestorePath(), getFirestoreDocKey(key)), doc(db, getFirestorePath(), shardDocKey(key, "manifest"))];
  const snaps = await Promise.all(refs.map(getDoc));
  const manifest = snaps[1];
  if (manifest.exists() && manifest.data().sharded === 1) {
    const count = Math.max(0, Number(manifest.data().count) || 0);
    const chunks = await Promise.all(Array.from({length: count}, function(_, i) { return getDoc(doc(db, getFirestorePath(), shardDocKey(key, "chunk_" + i))); }));
    shardedKeys.add(key);
    return { exists: true, value: parseShardSnapshots(chunks) };
  }
  return { exists: snaps[0].exists(), value: snaps[0].exists() ? parseStoredValue(snaps[0]) : undefined };
}

const engineStore = {
  getLocal(key) { return window[windowVarFor(key)]; },
  applyLocal(key, value) {
    try {
      applyLoadedValue(key, value);
    } catch (error) {
      console.error("applyLoadedValue error for " + key + ":", error);
    }
    scheduleRealtimeRefresh(key);
  },
  readBase: readSyncBase,
  writeBase: writeSyncBase
};

let tooLargeKey = null;

function createSyncEngine() {
  const Merge = window.PokerHQMerge;
  if (!Merge) {
    // merge.js failed to load — fall back to plain last-write-wins rather than not syncing.
    console.warn("PokerHQMerge missing; falling back to overwrite sync.");
    return {
      push(key, data) {
        return firestoreIo.write(key, data).catch(function(error) {
          if (typeof window.queueFailedSave === "function") window.queueFailedSave(key, data);
          throw error;
        });
      },
      ingest(key, value) { engineStore.applyLocal(key, value); }
    };
  }
  return Merge.createEngine({
    mergeKeys: MERGE_KEYS,
    io: firestoreIo,
    store: engineStore,
    isDemo() { return !!window._demoMode; },
    onStatus(state) {
      if (state === "syncing") setSyncStatus("syncing", "Saving...");
      else if (state === "ok") { tooLargeKey = null; setSyncStatus("ok", "Synced"); }
      else if (state === "error") {
        // A list that has outgrown Firestore's 1 MiB document limit can never
        // save; say so instead of a vague "Save failed" (see the size warning).
        if (tooLargeKey) setSyncStatus("error", "Too large to sync", { tooLarge: tooLargeKey });
        else setSyncStatus("error", "Save failed");
      }
    },
    onError(key, error) {
      console.error("fbSave error (" + key + "):", error);
      const tooLarge = typeof window.isCloudTooLargeError === "function" && window.isCloudTooLargeError(error);
      tooLargeKey = tooLarge ? key : (tooLargeKey === key ? null : tooLargeKey);
    },
    // Failed while believed online (a real offline write never reaches fbSave —
    // save() queues it directly). Re-queue so the next reconnect or sign-in
    // retries it instead of silently losing the change.
    onFailure(key, data) {
      // Too large will fail identically on every retry; the data is safe locally
      // and the next save after trimming pushes the whole list again.
      if (tooLargeKey === key) return;
      if (typeof window.queueFailedSave === "function") window.queueFailedSave(key, data);
    }
  });
}

let syncEngine = null;
function getSyncEngine() {
  if (!syncEngine) syncEngine = createSyncEngine();
  return syncEngine;
}

// opts.overwrite: replace the cloud copy instead of merging (used by backup
// restore, where records missing from the backup must disappear everywhere).
export async function fbSave(key, data, opts) {
  try {
    await getSyncEngine().push(key, data, opts);
  } catch (error) {
    setSyncStatus("error", "Save failed");
    console.error("fbSave error:", error);
  }
}

export async function fbLoadAll() {
  try {
    setSyncStatus("syncing", "Syncing...");
    const engine = getSyncEngine();
    const snaps = await Promise.all(FIRESTORE_KEYS.map(readCloudValue));
    FIRESTORE_KEYS.forEach(function(key, index) {
      const snap = snaps[index];
      if (!snap.exists) return;
      const value = snap.value;
      if (value === undefined) {
        console.error("fbLoadAll: unreadable value for " + key + " — keeping local copy");
        return;
      }
      engine.ingest(key, value);
    });
    setSyncStatus("ok", "Synced");
    if (!window._demoMode) refreshAllUi();
  } catch (error) {
    if (error && error.code === "permission-denied") {
      handleAccessDenied();
      return;
    }
    setSyncStatus("error", "Sync failed — using local data");
    console.error("fbLoadAll error:", error);
  }
}

function teardownRealtimeListeners() {
  unsubscribeListeners.forEach(function(unsub) {
    try {
      unsub();
    } catch {}
  });
  unsubscribeListeners = [];
}

function startRealtimeListeners() {
  teardownRealtimeListeners();
  const engine = getSyncEngine();
  FIRESTORE_KEYS.forEach(function(key) {
    const unsubscribe = onSnapshot(doc(db, getFirestorePath(), getFirestoreDocKey(key)), function(snap) {
      if (!snap.exists() || shardedKeys.has(key)) return;
      const value = parseStoredValue(snap);
      if (value === undefined) return;
      engine.ingest(key, value);
      setSyncStatus("ok", "Synced");
    }, function(error) {
      if (error && error.code === "permission-denied") handleAccessDenied();
    });
    unsubscribeListeners.push(unsubscribe);
    const shardUnsubscribe = onSnapshot(doc(db, getFirestorePath(), shardDocKey(key, "manifest")), function(snap) {
      if (!snap.exists() || snap.data().sharded !== 1) return;
      shardedKeys.add(key);
      readCloudValue(key).then(function(result) {
        if (result.value === undefined) return;
        engine.ingest(key, result.value);
        setSyncStatus("ok", "Synced");
      });
    }, function(error) { if (error && error.code === "permission-denied") handleAccessDenied(); });
    unsubscribeListeners.push(shardUnsubscribe);
  });
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
let syncStarted = false;

function setLoginUiState(state, message) {
  const overlay = document.getElementById("login-overlay");
  const statusEl = document.getElementById("login-status");
  const errorEl = document.getElementById("login-error");
  const buttonEl = document.getElementById("login-google-btn");
  const signoutBtn = document.getElementById("signout-btn");
  if (!overlay) return;
  if (window._demoMode) { overlay.classList.add("hidden"); if(signoutBtn)signoutBtn.style.display="none"; return; }
  if (state === "hidden") {
    overlay.classList.add("hidden");
    if (signoutBtn) signoutBtn.style.display = "";
    return;
  }
  overlay.classList.remove("hidden");
  if (signoutBtn) signoutBtn.style.display = "none";
  if (statusEl) {
    statusEl.style.display = state === "checking" ? "" : "none";
    if (state === "checking" && message) statusEl.textContent = message;
  }
  if (buttonEl) buttonEl.style.display = state === "signin" ? "" : "none";
  if (errorEl) {
    if (state === "signin" && message) {
      errorEl.textContent = message;
      errorEl.style.display = "";
    } else {
      errorEl.style.display = "none";
    }
  }
}

const POPUP_FALLBACK_CODES = [
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment"
];

function friendlySignInError(error) {
  const code = error && error.code;
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  if (code === "auth/unauthorized-domain") return "This domain is not authorized for sign-in.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  return "Couldn't sign in. Please try again.";
}

function handleAccessDenied() {
  const email = window.__pokerhqAuthEmail || "This Google account";
  signOut(auth).catch(function() {});
  setLoginUiState("signin", email + " doesn't have access to PokerHQ data. Sign in with the owner account.");
}

window.pokerhqSignIn = function() {
  setLoginUiState("checking", "Opening Google sign-in...");
  signInWithPopup(auth, googleProvider).catch(function(error) {
    if (POPUP_FALLBACK_CODES.indexOf(error && error.code) !== -1) {
      // Popups are unreliable in standalone/home-screen mode — use a full redirect.
      return signInWithRedirect(auth, googleProvider).catch(function(redirectError) {
        setLoginUiState("signin", friendlySignInError(redirectError));
      });
    }
    setLoginUiState("signin", friendlySignInError(error));
  });
};

window.pokerhqSignOut = function() {
  signOut(auth).finally(function() { location.reload(); });
};
window.pokerhqShowSignIn = function() { setLoginUiState("signin"); };

function startSyncForUser(user) {
  window.__pokerhqAuthUid = user.uid;
  window.__pokerhqAuthEmail = user.email || "";
  if (window.renderBuildBadge) window.renderBuildBadge();
  if (window.renderAiSettings) window.renderAiSettings();
  if (window.refreshPushUi) window.refreshPushUi();
  setLoginUiState("hidden");
  if (syncStarted) return;
  syncStarted = true;
  if (navigator.onLine && window.flushOfflineQueue) window.flushOfflineQueue();
  startRealtimeListeners();
  fbLoadAll();
}

export function initSync() {
  resolvedProfile = resolveProfileConfig();
  window.__pokerhqResolvedProfile = resolvedProfile;
  window._syncMeta = window._syncMeta || { status: "syncing", msg: "Loading...", updated: Date.now() };
  window.fbSave = fbSave;
  window.fbLoadAll = fbLoadAll;
  window.setSyncStatus = setSyncStatus;
  setLoginUiState("checking", "Checking sign-in...");
  getRedirectResult(auth).catch(function() {});
  onAuthStateChanged(auth, function(user) {
    if (user && user.isAnonymous) {
      // Sessions from the pre-login build — drop them and ask for a real sign-in.
      signOut(auth).catch(function() {});
      return;
    }
    if (user) {
      startSyncForUser(user);
    } else {
      window.__pokerhqAuthUid = null;
      window.__pokerhqAuthEmail = "";
      if (window.renderBuildBadge) window.renderBuildBadge();
      teardownRealtimeListeners();
      syncStarted = false;
      setSyncStatus("offline", "Signed out");
      setLoginUiState("signin");
    }
  });
}
