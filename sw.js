/* PokerHQ service worker — keeps the app shell available offline.
   Navigations are network-first so new deploys land on the next load;
   static assets are stale-while-revalidate. Sync/API traffic is never cached. */
var CACHE_NAME = 'pokerhq-shell-v2';

var PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './js/app.js',
  './js/data/config.js',
  './js/data/config-runtime.js',
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
  './js/features/library.js',
  './js/features/onboarding.js',
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
  'api.anthropic.com'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE);
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(key) {
        return key !== CACHE_NAME;
      }).map(function(key) {
        return caches.delete(key);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (BYPASS_HOSTS.indexOf(url.hostname) !== -1) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function(res) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(req, copy); });
        return res;
      }).catch(function() {
        return caches.match(req).then(function(hit) {
          return hit || caches.match('./index.html');
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
