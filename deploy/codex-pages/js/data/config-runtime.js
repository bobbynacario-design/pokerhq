(function() {
  var LEGACY_FIRESTORE_PATH = "pokerhq-bob";
  var LEGACY_LOCAL_PREFIX = "pokerhq_";
  var PROFILE_STORAGE_KEY = "pokerhq_profile";
  var OFFLINE_QUEUE_KEY = "offline_queue";

  function sanitizeProfileSegment(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function sanitizeLocalPrefix(value) {
    var cleaned = String(value || "")
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
      var cfg = window.PokerHQConfig || {};
      return cfg.overrideProfile || null;
    } catch (e) {
      return null;
    }
  }

  function readStoredProfile() {
    try {
      var raw = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return { id: raw };
      }
    } catch (e) {
      return null;
    }
  }

  function resolveProfileConfig() {
    var runtimeOverride = readRuntimeProfileOverride();
    if (runtimeOverride) {
      var overrideObject = typeof runtimeOverride === "object" ? runtimeOverride : { id: runtimeOverride };
      var overrideId = sanitizeProfileSegment(overrideObject.id);
      var overridePath = String(overrideObject.firestorePath || "").trim();
      var overridePrefix = String(overrideObject.localPrefix || "").trim();
      return {
        id: overrideId || "runtime-override",
        firestorePath: overridePath || (overrideId ? buildProfileFirestorePath(overrideId) : LEGACY_FIRESTORE_PATH),
        localPrefix: overridePrefix ? sanitizeLocalPrefix(overridePrefix) : (overrideId ? buildProfileLocalPrefix(overrideId) : LEGACY_LOCAL_PREFIX),
        source: "runtime-override"
      };
    }

    var stored = readStoredProfile();
    if (!stored) {
      return {
        id: "legacy-default",
        firestorePath: LEGACY_FIRESTORE_PATH,
        localPrefix: LEGACY_LOCAL_PREFIX,
        source: "legacy-default"
      };
    }

    var storedObject = typeof stored === "object" ? stored : { id: stored };
    var safeId = sanitizeProfileSegment(storedObject.id);
    var explicitPath = String(storedObject.firestorePath || "").trim();
    var explicitPrefix = String(storedObject.localPrefix || "").trim();

    return {
      id: safeId || "legacy-default",
      firestorePath: explicitPath || (safeId ? buildProfileFirestorePath(safeId) : LEGACY_FIRESTORE_PATH),
      localPrefix: explicitPrefix ? sanitizeLocalPrefix(explicitPrefix) : (safeId ? buildProfileLocalPrefix(safeId) : LEGACY_LOCAL_PREFIX),
      source: explicitPath ? "explicit-path" : (safeId ? "profile-id" : "legacy-default")
    };
  }

  function resolveLegacyLocalStorageKey(baseKey) {
    return LEGACY_LOCAL_PREFIX + baseKey;
  }

  function resolveLocalStorageKey(baseKey, profileConfig) {
    var config = profileConfig || resolveProfileConfig();
    return String((config && config.localPrefix) || LEGACY_LOCAL_PREFIX) + baseKey;
  }

  function resolveLocalReadKeys(baseKey, profileConfig) {
    var primaryKey = resolveLocalStorageKey(baseKey, profileConfig);
    var legacyKey = resolveLegacyLocalStorageKey(baseKey);
    return primaryKey === legacyKey ? [primaryKey] : [primaryKey, legacyKey];
  }

  window.PokerHQConfig = Object.assign({}, window.PokerHQConfig || {}, {
    LEGACY_FIRESTORE_PATH: LEGACY_FIRESTORE_PATH,
    LEGACY_LOCAL_PREFIX: LEGACY_LOCAL_PREFIX,
    PROFILE_STORAGE_KEY: PROFILE_STORAGE_KEY,
    OFFLINE_QUEUE_KEY: OFFLINE_QUEUE_KEY,
    readStoredProfile: readStoredProfile,
    resolveProfileConfig: resolveProfileConfig,
    resolveLegacyLocalStorageKey: resolveLegacyLocalStorageKey,
    resolveLocalStorageKey: resolveLocalStorageKey,
    resolveLocalReadKeys: resolveLocalReadKeys
  });
})();
