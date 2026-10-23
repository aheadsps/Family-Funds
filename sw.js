// Офлайн-режим: файлы сайта берутся из сети, а без сети из кэша.
// Библиотеки Firebase кэшируются навсегда (их адрес содержит версию).
const CACHE = 'family-funds-v2';
const SHELL = ['./', './index.html', './app.js', './fb.js', './firebase-config.js', './seed.js',
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

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms))]); }

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        return (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('./index.html') : Response.error());
      }
    })());
  } else if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; })));
  }
});
