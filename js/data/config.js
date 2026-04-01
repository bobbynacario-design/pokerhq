export const firebaseConfig = {
  apiKey: "AIzaSyB_6PnXWdtpR-x-jcJIuzOaROoVRplY5SM",
  authDomain: "pokerhq-a67e4.firebaseapp.com",
  projectId: "pokerhq-a67e4",
  storageBucket: "pokerhq-a67e4.firebasestorage.app",
  messagingSenderId: "91226487101",
  appId: "1:91226487101:web:0cf1b3411ff9d17a00ad54"
};

export const FIRESTORE_KEYS = [
  "sessions",
  "tourneys",
  "hands",
  "strategies",
  "news",
  "spotlights",
  "bankroll",
  "satellites",
  "opponents",
  "timer"
];

export const LEGACY_FIRESTORE_PATH = "pokerhq-bob";
export const LEGACY_LOCAL_PREFIX = "pokerhq_";
export const PROFILE_STORAGE_KEY = "pokerhq_profile";
export const OFFLINE_QUEUE_KEY = "offline_queue";
export const LEGACY_FIRESTORE_DOC_PREFIX = "";

function sanitizeLocalPrefix(value) {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned ? cleaned.replace(/_+$/g, "") + "_" : LEGACY_LOCAL_PREFIX;
}

function buildProfileFirestorePath(profileId) {
  return "pokerhq-profile-" + profileId;
}

function buildProfileLocalPrefix(profileId) {
  return "pokerhq_" + profileId + "_";
}

function readRuntimeProfileOverride() {
  try {
    const cfg = window.PokerHQConfig || {};
    return cfg.overrideProfile || null;
  } catch {
    return null;
  }
}

function sanitizeProfileSegment(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function readStoredProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return { id: raw };
    }
  } catch {
    return null;
  }
}

export function resolveProfileConfig() {
  const runtimeOverride = readRuntimeProfileOverride();
  if (runtimeOverride) {
    const overrideObject = typeof runtimeOverride === "object" ? runtimeOverride : { id: runtimeOverride };
    const overrideId = sanitizeProfileSegment(overrideObject.id);
    const overridePath = String(overrideObject.firestorePath || "").trim();
    const overridePrefix = String(overrideObject.localPrefix || "").trim();

    return {
      id: overrideId || "runtime-override",
      firestorePath: overridePath || (overrideId ? buildProfileFirestorePath(overrideId) : LEGACY_FIRESTORE_PATH),
      firestoreDocPrefix: String(overrideObject.firestoreDocPrefix || "").trim(),
      localPrefix: overridePrefix ? sanitizeLocalPrefix(overridePrefix) : (overrideId ? buildProfileLocalPrefix(overrideId) : LEGACY_LOCAL_PREFIX),
      source: "runtime-override"
    };
  }

  const stored = readStoredProfile();
  if (!stored) {
    return {
      id: "legacy-default",
      firestorePath: LEGACY_FIRESTORE_PATH,
      firestoreDocPrefix: LEGACY_FIRESTORE_DOC_PREFIX,
      localPrefix: LEGACY_LOCAL_PREFIX,
      source: "legacy-default"
    };
  }

  const storedObject = typeof stored === "object" ? stored : { id: stored };
  const safeId = sanitizeProfileSegment(storedObject.id);
  const explicitPath = String(storedObject.firestorePath || "").trim();
  const explicitPrefix = String(storedObject.localPrefix || "").trim();

  return {
    id: safeId || "legacy-default",
    firestorePath: explicitPath || (safeId ? buildProfileFirestorePath(safeId) : LEGACY_FIRESTORE_PATH),
    firestoreDocPrefix: String(storedObject.firestoreDocPrefix || "").trim(),
    localPrefix: explicitPrefix ? sanitizeLocalPrefix(explicitPrefix) : (safeId ? buildProfileLocalPrefix(safeId) : LEGACY_LOCAL_PREFIX),
    source: explicitPath ? "explicit-path" : (safeId ? "profile-id" : "legacy-default")
  };
}

export function resolveFirestorePath() {
  return resolveProfileConfig().firestorePath;
}

export function resolveLegacyLocalStorageKey(baseKey) {
  return LEGACY_LOCAL_PREFIX + baseKey;
}

export function resolveLocalStorageKey(baseKey, profileConfig = resolveProfileConfig()) {
  return String((profileConfig && profileConfig.localPrefix) || LEGACY_LOCAL_PREFIX) + baseKey;
}

export function resolveLocalReadKeys(baseKey, profileConfig = resolveProfileConfig()) {
  const primaryKey = resolveLocalStorageKey(baseKey, profileConfig);
  const legacyKey = resolveLegacyLocalStorageKey(baseKey);
  return primaryKey === legacyKey ? [primaryKey] : [primaryKey, legacyKey];
}
