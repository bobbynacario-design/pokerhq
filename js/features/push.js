// ── PHONE NOTIFICATIONS ── (Web Push)
// The server (pokerhqPush / pokerhqPushAlerts in functions/index.js) owns the
// keys and does the sending; this file asks permission, subscribes THIS device
// and shows its state. The switches (before-start alerts, morning summary) live
// in the synced reminderSettings — see calendar.js.

function pushCall(payload) {
  if (typeof window.pokerhqPushCall !== 'function') return Promise.reject(new Error('Notifications are not available yet — reload the page.'));
  return window.pokerhqPushCall(payload);
}

function pushIsIOS() {
  var ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function pushIsStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Short name shown in the device list on the server, e.g. "iPhone" or "Windows (Chrome)".
function pushDeviceLabel() {
  var ua = navigator.userAgent || '';
  var os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
  var browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? os + ' (' + browser + ')' : os;
}

// VAPID public key (base64url) → the Uint8Array pushManager.subscribe wants.
function pushKeyToBytes(base64Url) {
  var padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  var raw = atob((base64Url + padding).replace(/-/g, '+').replace(/_/g, '/'));
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// The service-worker registration, or null if it never becomes ready (e.g. the
// page isn't served over https). Kept as its own function so tests can replace it.
function pushRegistration() {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 8000); })
  ]);
}

async function pushCurrentSubscription() {
  var reg = await pushRegistration();
  if (!reg || !reg.pushManager) return null;
  return reg.pushManager.getSubscription();
}

function pushErrorText(err) {
  var code = err && err.code;
  if (code === 'functions/not-found') return 'The notification service isn\'t deployed yet — run "npm run deploy" in the functions folder.';
  if (code === 'functions/permission-denied' || code === 'functions/unauthenticated') return 'Sign in with the owner account first.';
  return (err && err.message) || 'Something went wrong.';
}

// One of: unsupported | needs-install | signed-out | blocked | off | on
async function pushGetState() {
  if (pushIsIOS() && !pushIsStandalone()) return { state: 'needs-install' };
  if (!pushSupported()) return { state: 'unsupported' };
  if (!window.__pokerhqAuthUid) return { state: 'signed-out' };
  if (Notification.permission === 'denied') return { state: 'blocked' };
  var sub = null;
  try { sub = await pushCurrentSubscription(); } catch (e) { sub = null; }
  return { state: sub ? 'on' : 'off', subscription: sub };
}

function pushShow(elId, text, kind) {
  var el = document.getElementById(elId);
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
  el.style.display = 'block';
  el.style.color = kind === 'ok' ? 'var(--green)' : kind === 'error' ? 'var(--red)' : 'rgba(255,255,255,.55)';
  el.textContent = text;
}

var _pushRefreshSeq = 0;
async function refreshPushUi() {
  var statusEl = document.getElementById('push-status');
  if (!statusEl) return;
  var seq = ++_pushRefreshSeq;
  var s = await pushGetState();
  if (seq !== _pushRefreshSeq) return;   // a newer refresh is already in flight
  var messages = {
    'needs-install': 'On iPhone and iPad, notifications only work from the Home Screen app. Tap Share → Add to Home Screen, open PokerHQ from there, then come back here.',
    'unsupported': 'This browser can\'t receive push notifications. Try Chrome or Edge on desktop or Android, or the Home Screen app on iOS 16.4 or newer.',
    'signed-out': 'Sign in to turn on notifications.',
    'blocked': 'Notifications are blocked for this site. Allow them in your browser or phone settings, then reload this page.',
    'off': 'Off on this device. Turn them on to get a heads-up before events you\'re planning to play.',
    'on': '✓ On for this device (' + pushDeviceLabel() + '). Alerts go to every device you\'ve turned on.'
  };
  statusEl.textContent = messages[s.state] || '';
  statusEl.style.color = s.state === 'on' ? 'var(--green)' : '';
  var show = function (id, visible) { var el = document.getElementById(id); if (el) el.style.display = visible ? '' : 'none'; };
  show('push-enable-btn', s.state === 'off');
  show('push-test-btn', s.state === 'on');
  show('push-disable-btn', s.state === 'on');
}

// Must run straight from a tap: iOS only shows the permission prompt for a user gesture.
async function enablePush() {
  var btn = document.getElementById('push-enable-btn');
  pushShow('push-result', '', '');
  try {
    if (!window.__pokerhqAuthUid) throw new Error('Sign in first.');
    var permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      pushShow('push-result', permission === 'denied'
        ? 'Notifications were blocked. Allow them for this site in your settings, then try again.'
        : 'No permission given — nothing was turned on.', 'error');
      await refreshPushUi();
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'TURNING ON…'; }
    var config = await pushCall({ action: 'config' });
    var reg = await pushRegistration();
    if (!reg) throw new Error('The app isn\'t ready for notifications yet — reload the page and try again.');
    var sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: pushKeyToBytes(config.data.publicKey) });
    await pushCall({ action: 'subscribe', subscription: sub.toJSON(), device: pushDeviceLabel() });
    pushShow('push-result', '✓ Turned on. Tap "Send a test" to check it arrives.', 'ok');
  } catch (err) {
    pushShow('push-result', '✗ ' + pushErrorText(err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'ENABLE ON THIS DEVICE'; }
    await refreshPushUi();
  }
}

async function disablePush() {
  pushShow('push-result', '', '');
  try {
    var sub = await pushCurrentSubscription();
    if (sub) {
      var endpoint = sub.endpoint;
      await sub.unsubscribe();
      try { await pushCall({ action: 'unsubscribe', endpoint: endpoint }); } catch (e) { /* the device is already off; the server copy is pruned on its next failed send */ }
    }
    pushShow('push-result', 'Turned off on this device.', 'muted');
  } catch (err) {
    pushShow('push-result', '✗ ' + pushErrorText(err), 'error');
  }
  await refreshPushUi();
}

async function sendTestPush() {
  var btn = document.getElementById('push-test-btn');
  pushShow('push-result', '', '');
  if (btn) btn.disabled = true;
  try {
    var sub = await pushCurrentSubscription();
    if (!sub) throw new Error('This device isn\'t turned on yet.');
    var res = await pushCall({ action: 'test', endpoint: sub.endpoint });
    var r = res.data || {};
    if (r.sent > 0) pushShow('push-result', '✓ Sent — it should arrive within a few seconds.', 'ok');
    else if (r.removed > 0) pushShow('push-result', '✗ The push service says this device is no longer registered. Turn it off and on again.', 'error');
    else pushShow('push-result', '✗ The push service didn\'t accept it. Try again in a minute.', 'error');
  } catch (err) {
    pushShow('push-result', '✗ ' + pushErrorText(err), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

refreshPushUi();
