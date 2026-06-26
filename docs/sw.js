/* orz Markdown editor — service worker. Caches the app shell (renderer, editor,
 * themes) and the CDN editor/maths assets so the app installs and works offline.
 * Mermaid/SMILES are loaded lazily only when used, so they need network. */
var CACHE = 'orz-md-v4';
var CM = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
var HLJS = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/';
var ASSETS = [
  './', './editor.html', './editor.js', './orzmd.browser.js', './manifest.webmanifest', './icon.svg', './orz.svg',
  './themes/common.css',
  './themes/light-neat-1.css', './themes/light-neat-2.css', './themes/light-neat-3.css',
  './themes/light-academic-1.css', './themes/light-academic-2.css',
  './themes/beige-decent-1.css', './themes/beige-decent-2.css',
  './themes/light-playful-1.css', './themes/light-playful-2.css',
  './themes/dark-elegant-1.css', './themes/dark-elegant-2.css',
  CM + 'codemirror.min.css', CM + 'codemirror.min.js', CM + 'mode/markdown/markdown.min.js',
  CM + 'theme/material-darker.min.css',
  HLJS + 'highlight.min.js', HLJS + 'styles/github.min.css', HLJS + 'styles/atom-one-dark.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css'
];

self.addEventListener('install', function (e) {
  // Do NOT skipWaiting here — let a new version wait so the page can notify the
  // user, then activate on demand via the SKIP_WAITING message below.
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // tolerate individual CDN failures so install still succeeds
    return Promise.all(ASSETS.map(function (u) { return c.add(u).catch(function () {}); }));
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
  // cache-first, fall back to network and populate the cache
  e.respondWith(caches.match(e.request).then(function (r) {
    return r || fetch(e.request).then(function (resp) {
      try { var copy = resp.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); } catch (x) {}
      return resp;
    }).catch(function () { return r; });
  }));
});
