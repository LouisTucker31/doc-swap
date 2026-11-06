/* Doc Swap service worker
   - Works offline: the whole app (including converter libraries) is saved on first visit.
   - Updates itself: the core files (index.html, app.js, styles.css, manifest) are always
     fetched fresh when you're online, so pushing to GitHub is enough. Just reopen the app,
     or tap "Check for updates" in the footer.
   - If you change a library or icon file, also bump VERSION so the saved copies are replaced. */
const VERSION = 'docswap-v3';

const CORE = ['./', './index.html', './app.js', './styles.css', './manifest.webmanifest'];
const ASSETS = [
  ...CORE,
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
const CORE_PATHS = new Set(CORE.map(p => new URL(p, self.location).pathname));

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
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

/* Fresh from the network (skipping the browser's HTTP cache), saved for offline.
   Falls back to the saved copy if offline or the network takes longer than 3 seconds. */
function networkFirst(url, cacheKey) {
  const network = fetch(url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(cacheKey, copy)); }
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, 3000));
  return Promise.race([network.catch(() => null), timeout]).then(res =>
    res || caches.match(cacheKey).then(hit => hit || network)
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(url.href, './index.html'));
    return;
  }
  if (CORE_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(url.href, req));
    return;
  }
  // Libraries, fonts, icons: saved copy first (fast + offline), network as a backup
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
