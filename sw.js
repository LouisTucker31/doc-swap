/* Doc Swap service worker
   Saves the whole app (including converter libraries) for offline use.
   When you change any file, bump VERSION so phones pick up the update. */
const VERSION = 'docswap-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles.css',
  './app.js',
  './icon.svg',
  './apple-touch-icon.png',
  './favicon-32.png',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './jakarta-500.woff2',
  './jakarta-600.woff2',
  './jakarta-700.woff2',
  './jakarta-800.woff2',
  './pdf.min.js',
  './pdf.worker.min.js',
  './pdf-lib.min.js',
  './jszip.min.js',
  './heic2any.min.js',
  './mammoth.browser.min.js',
  './html2pdf.bundle.min.js',
  './xlsx.full.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Pages: try the network first so updates show, fall back to the saved copy offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Everything else: saved copy first, then network
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
