function showOnboarding() {
  if (localStorage.getItem('pokerhq_onboarded') || sessions.length > 0 || window._demoMode) return;
  var el = document.getElementById('onboarding-overlay');
  if (el) el.style.display = 'flex';
}

function dismissOnboarding() {
  localStorage.setItem('pokerhq_onboarded', 'true');
  var el = document.getElementById('onboarding-overlay');
  if (el) el.style.display = 'none';
}

function onboardingOverlayClick(e) {
  if (e.target === document.getElementById('onboarding-overlay')) dismissOnboarding();
}
