var ONBOARDED_UI_KEY = 'onboarded';
var LEGACY_ONBOARDED_UI_KEY = 'pokerhq_onboarded';

function getOnboardingStorageKey() {
  var cfg = window.PokerHQConfig || {};
  return cfg.resolveUiStorageKey ? cfg.resolveUiStorageKey(ONBOARDED_UI_KEY) : LEGACY_ONBOARDED_UI_KEY;
}

function readOnboardingDismissed() {
  var cfg = window.PokerHQConfig || {};
  var keys = cfg.resolveUiReadKeys ? cfg.resolveUiReadKeys(ONBOARDED_UI_KEY, LEGACY_ONBOARDED_UI_KEY) : [LEGACY_ONBOARDED_UI_KEY];
  for (var i = 0; i < keys.length; i++) {
    if (localStorage.getItem(keys[i])) return true;
  }
  return false;
}

function showOnboarding() {
  if (readOnboardingDismissed() || sessions.length > 0 || window._demoMode) return;
  var el = document.getElementById('onboarding-overlay');
  if (el) el.style.display = 'flex';
}

function dismissOnboarding() {
  localStorage.setItem(getOnboardingStorageKey(), 'true');
  var el = document.getElementById('onboarding-overlay');
  if (el) el.style.display = 'none';
}

function onboardingOverlayClick(e) {
  if (e.target === document.getElementById('onboarding-overlay')) dismissOnboarding();
}
