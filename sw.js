// Файлы сайта отдаются из кэша сразу (без белого экрана на запуске) и обновляются в фоне:
// новая версия откроется при следующем запуске. Без сети работает из кэша.
// Библиотеки Firebase кэшируются навсегда (их адрес содержит версию).
const CACHE = 'potok-v14';
const SHELL = ['./', './index.html', './app.js', './icons.js', './fb.js', './firebase-config.js', './seed.js', './unbounded.woff', './golos-cyrillic.woff2', './golos-latin.woff2',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
const FB = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js']
  .map(f => 'https://www.gstatic.com/firebasejs/10.12.2/' + f);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).then(() => Promise.allSettled(FB.map(u => c.add(u))))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Код сайта обновился в кэше, но открытая страница ещё старая: говорим ей об этом (один раз за жизнь воркера)
let announced = false;
function announce() {
  if (announced) return; announced = true;
  self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'update' })));
}

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const key = req.mode === 'navigate' ? './index.html' : req;
      const cached = await c.match(key, { ignoreSearch: true });
      const fresh = fetch(req).then(res => {
        if (res.ok) {
          const was = cached && (cached.headers.get('etag') || cached.headers.get('last-modified'));
          const now = res.headers.get('etag') || res.headers.get('last-modified');
          c.put(key, res.clone());
          if (was && now && was !== now && /\.(js|html)$|\/$/.test(url.pathname)) announce();
        }
        return res;
      });
      if (cached) { e.waitUntil(fresh.catch(() => {})); return cached; }
      try { return await withTimeout(fresh, 8000); }
      catch (err) { return (req.mode === 'navigate' ? await c.match('./index.html') : null) || Response.error(); }
    })());
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
  }
});
