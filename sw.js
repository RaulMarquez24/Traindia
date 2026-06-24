// Service Worker - Traindía
// La versión visible de la app es v2.4.1 (ver pie en la app).
// CACHE_NAME es solo la clave de caché: súbele el número de build en cada deploy
// (build-6, build-7, …) para que los cambios lleguen a las apps ya instaladas.
const CACHE_NAME = 'traindia-build-49';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './db.js',
  './ui.js',
  './views-plan.js',
  './views-sessions.js',
  './views-progress.js',
  './views-journal.js',
  './views-data.js',
  './app.js',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(err => {
        console.log('Cache install error:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Archivos de la app: NETWORK-FIRST. Con red siempre sirve lo último
    // (las actualizaciones se ven al recargar); sin red, tira de la caché.
    event.respondWith(
      fetch(req).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone).catch(() => {}));
        }
        return response;
      }).catch(() => caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
    );
  } else {
    // Recursos externos (fuentes): CACHE-FIRST (estáticos, más rápido).
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone).catch(() => {}));
        }
        return response;
      }).catch(() => undefined))
    );
  }
});
