/* orz Markdown editor — service worker. Caches the app shell (renderer, editor,
 * themes) and the CDN editor/maths assets so the app installs and works offline.
 * Mermaid/SMILES/Chart are loaded lazily only when used, so they need network. */
var CACHE = 'orz-md-v12';
var LEGACY_CACHE = 'orz-md-v11';
var CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
var HLJS = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/';
var ASSETS = [
  './', './editor.html', './editor.js', './orzmd.browser.js', './manifest.webmanifest', './icon.svg', './orz.svg',
  './themes/common.css',
  './themes/light-neat-1.css', './themes/light-neat-2.css', './themes/light-neat-3.css',
  './themes/light-academic-1.css', './themes/light-academic-2.css',
  './themes/beige-decent-1.css', './themes/beige-decent-2.css',
  './themes/light-playful-1.css', './themes/light-playful-2.css',
  './themes/dark-elegant-1.css', './themes/dark-elegant-2.css', './themes/dark-elegant-3.css',
  CM + 'codemirror.min.css', CM + 'codemirror.min.js', CM + 'mode/markdown/markdown.min.js',
  CM + 'theme/material-darker.min.css',
  HLJS + 'highlight.min.js', HLJS + 'styles/github.min.css', HLJS + 'styles/atom-one-dark.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css'
];
var ASSET_URLS = ASSETS.map(function (u) { return new URL(u, self.location.href).href; });

self.addEventListener('install', function (e) {
  // Do NOT skipWaiting here — let a new version wait so the page can notify the
  // user, then activate on demand via the SKIP_WAITING message below.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // tolerate individual CDN failures so install still succeeds
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
  }).then(function () {
    // One-time migration: activate immediately when replacing the root-scoped
    // v11 worker, whose catch-all cache could pin stale website starter files.
    return caches.has(LEGACY_CACHE).then(function (hasLegacy) {
      if (hasLegacy) return self.skipWaiting();
    });
  }));
});

self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // This worker exists only to make the editor app shell available offline.
  // Let normal website pages and portable starters use the network/browser
  // cache so a framework release cannot be pinned by this long-lived cache.
  if (ASSET_URLS.indexOf(e.request.url) === -1) return;
  // App-shell asset: cache-first, fall back to network and populate the cache.
  e.respondWith(caches.match(e.request).then(function (r) {
    return r || fetch(e.request).then(function (resp) {
      try { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); } catch (x) {}
      return resp;
    }).catch(function () { return r; });
  }));
});
