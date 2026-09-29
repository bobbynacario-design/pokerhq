/* PokerHQ service worker — keeps the app shell available offline.
   Navigations and same-origin assets are network-first so a deploy is never
   half-applied (fresh HTML must pair with fresh JS/CSS); the cache is the
   offline fallback. Cross-origin CDN assets (fonts, jspdf, gstatic modules)
   are stale-while-revalidate. Sync/API traffic is never cached. */
var CACHE_NAME = 'pokerhq-shell-v52';

var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './js/app.js',
  './js/data/config.js',
  './js/data/util.js',
  './js/data/merge.js',
  './js/data/pushfold.js',
  './js/data/icm.js',
  './js/data/stats.js',
  './js/data/drills.js',
  './js/data/config-runtime.js',
  './js/data/ai-proxy.js',
  './js/data/sync.js',
  './js/features/active-session.js',
  './js/features/demo-mode.js',
  './js/features/calculator.js',
  './js/features/staking.js',
  './js/features/package-report.js',
  './js/features/review.js',
  './js/features/calendar.js',
  './js/features/study-loop.js',
  './js/features/strategy.js',
  './js/features/hands.js',
  './js/features/treasury.js',
  './js/features/bankroll-chart.js',
  './js/features/library.js',
  './js/features/push.js',
  './js/features/onboarding.js',
  './js/features/daily-drill.js',
  './js/features/today-glance.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon-180.png'
];

/* Live data and AI calls must always hit the network. */
var BYPASS_HOSTS = [
  'firestore.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'www.googleapis.com',
  'api.openai.com',
  'api.anthropic.com',
  'asia-southeast1-pokerhq-a67e4.cloudfunctions.net'
];

self.addEventListener('install', function(event) {
  // Do NOT skipWaiting here — a new version waits until the user clicks
  // "Reload" in the in-app update banner, which posts SKIP_WAITING.
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    })
  );
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) {
        // Only clean up THIS app's own old caches. caches is per-origin and shared
        // with sibling apps (bob, enclave) on github.io — never delete theirs.
        return key.indexOf('pokerhq-shell-') === 0 && key !== CACHE_NAME;
      }).map(function(key) {
        return caches.delete(key);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

/* Phone notifications (Web Push). The server sends {title, body, tag, url}.
   Browsers require every push to show a notification, so this always does. */
self.addEventListener('push', function(event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'PokerHQ', {
    body: data.body || '',
    tag: data.tag || 'pokerhq',
    icon: './assets/icons/icon-192.png',
    data: { url: data.url || './' }
  }));
});

/* Tapping a notification focuses the app if it's open, otherwise opens it. */
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(target);
  }));
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (BYPASS_HOSTS.indexOf(url.hostname) !== -1) return;

  if (req.mode === 'navigate' || url.origin === self.location.origin) {
    // Revalidate with the server so the HTTP cache can't pin a stale asset
    // (navigation Requests can't be cloned with a cache override, so they keep req).
    var networkFetch = req.mode === 'navigate'
      ? fetch(req)
      : fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    event.respondWith(
      networkFetch.then(function(res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function() {
        // Versioned asset URLs (?v=) must still hit the queryless precache offline.
        return caches.match(req, { ignoreSearch: true }).then(function(hit) {
          return hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function(hit) {
      var refresh = fetch(req).then(function(res) {
        if (res && (res.status === 200 || res.type === 'opaque')) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function() { return hit; });
      return hit || refresh;
    })
  );
});
