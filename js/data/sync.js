import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  firebaseConfig,
  FIRESTORE_KEYS,
  resolveProfileConfig,
  resolveLocalStorageKey
} from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

function applyLoadedValue(key, value) {
  if (key === "sessions") window.sessions = value;
  if (key === "tourneys") window.tourneys = value;
  if (key === "hands") window.hands = value;
  if (key === "strategies") window.strategies = value;
  if (key === "news") window.newsItems = value;
  if (key === "spotlights") window.spotlights = value;
  if (key === "bankroll") window.bankroll = value;
  if (key === "satellites") window.satellites = value;
  if (key === "opponents") window.opponents = value;
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
  if (window.populateSessionDropdowns) window.populateSessionDropdowns();
  if (window.renderSatellites) window.renderSatellites();
  if (window.renderOpponents) window.renderOpponents();
  if (window.renderActiveSessionSurface) window.renderActiveSessionSurface();
}

function refreshRealtimeUi(key) {
  if (window.refreshDashboard) window.refreshDashboard();
  if (window.loadBankrollForm) window.loadBankrollForm();
  if (window.renderCalendarMonth) window.renderCalendarMonth();
  if (window.renderCalendarList) window.renderCalendarList();
  if (window.renderStrategy) window.renderStrategy();
  if (window.renderHands) window.renderHands();
  if (key === "satellites" && window.renderSatellites) window.renderSatellites();
  if (key === "opponents" && window.renderOpponents) window.renderOpponents();
  if (window.renderActiveSessionSurface) window.renderActiveSessionSurface();
}

export function setSyncStatus(status, msg) {
  window._syncMeta = { status, msg, updated: Date.now() };
  const el = document.getElementById("sync-status");
  if (!el) return;
  const colors = {
    syncing: "#F0A832",
    ok: "#2ECC71",
    error: "#E74C3C",
    offline: "rgba(255,255,255,.3)"
  };
  const icons = {
    syncing: "⟳",
    ok: "✓",
    error: "✗",
    offline: "○"
  };
  el.textContent = (icons[status] || "○") + " " + msg;
  el.style.color = colors[status] || "rgba(255,255,255,.3)";
  if (window.renderReliability) window.renderReliability();
}

function getFirestorePath() {
  return getResolvedProfile().firestorePath;
}

export async function fbSave(key, data) {
  try {
    setSyncStatus("syncing", "Saving...");
    await setDoc(doc(db, getFirestorePath(), getFirestoreDocKey(key)), {
      value: JSON.stringify(data),
      updated: Date.now()
    });
    setSyncStatus("ok", "Synced");
  } catch (error) {
    setSyncStatus("error", "Save failed");
    console.error("fbSave error:", error);
  }
}

export async function fbLoadAll() {
  try {
    setSyncStatus("syncing", "Syncing...");
    for (const key of FIRESTORE_KEYS) {
      const snap = await getDoc(doc(db, getFirestorePath(), getFirestoreDocKey(key)));
      if (!snap.exists()) continue;
      const value = JSON.parse(snap.data().value);
      applyLoadedValue(key, value);
    }
    setSyncStatus("ok", "Synced");
    refreshAllUi();
  } catch (error) {
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
  FIRESTORE_KEYS.forEach(function(key) {
    const unsubscribe = onSnapshot(doc(db, getFirestorePath(), getFirestoreDocKey(key)), function(snap) {
      if (!snap.exists()) return;
      const value = JSON.parse(snap.data().value);
      applyLoadedValue(key, value);
      setSyncStatus("ok", "Synced");
      refreshRealtimeUi(key);
    });
    unsubscribeListeners.push(unsubscribe);
  });
}

export function initSync() {
  resolvedProfile = resolveProfileConfig();
  window.__pokerhqResolvedProfile = resolvedProfile;
  window._syncMeta = window._syncMeta || { status: "syncing", msg: "Loading...", updated: Date.now() };
  window.fbSave = fbSave;
  window.fbLoadAll = fbLoadAll;
  window.setSyncStatus = setSyncStatus;
  if (navigator.onLine && window.flushOfflineQueue) window.flushOfflineQueue();
  startRealtimeListeners();
  fbLoadAll();
}
