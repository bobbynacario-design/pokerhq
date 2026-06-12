import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  firebaseConfig,
  FIRESTORE_KEYS,
  resolveProfileConfig,
  resolveLocalStorageKey
} from "./config.js?v=20260612e";

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
  if (key === "wallet") window.wallet = value;
  if (key === "walletLedger") window.walletLedger = value;
  if (key === "satellites") window.satellites = value;
  if (key === "opponents") window.opponents = value;
  if (key === "satTarget") window.satTarget = value;
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

function refreshRealtimeUi(key) {
  if (window.refreshDashboard) window.refreshDashboard();
  if (window.loadBankrollForm) window.loadBankrollForm();
  if (window.renderTreasury) window.renderTreasury();
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
  FIRESTORE_KEYS.forEach(function(key) {
    const unsubscribe = onSnapshot(doc(db, getFirestorePath(), getFirestoreDocKey(key)), function(snap) {
      if (!snap.exists()) return;
      const value = JSON.parse(snap.data().value);
      applyLoadedValue(key, value);
      setSyncStatus("ok", "Synced");
      refreshRealtimeUi(key);
    }, function(error) {
      if (error && error.code === "permission-denied") handleAccessDenied();
    });
    unsubscribeListeners.push(unsubscribe);
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

function startSyncForUser(user) {
  window.__pokerhqAuthUid = user.uid;
  window.__pokerhqAuthEmail = user.email || "";
  if (window.renderBuildBadge) window.renderBuildBadge();
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
