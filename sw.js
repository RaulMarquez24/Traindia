// Service Worker - Traindía
// La versión visible de la app es v2.11.2 (ver pie en la app).
// CACHE_NAME es solo la clave de caché: súbele el número de build en cada deploy
// (build-6, build-7, …) para que los cambios lleguen a las apps ya instaladas.
// Los fetch usan {cache:'reload'} para saltarse la caché HTTP del navegador/Pages
// y traer SIEMPRE la última versión con red (offline tira de CACHE_NAME).
const CACHE_NAME = 'traindia-build-106';
// Buzón temporal para archivos que llegan por "Compartir" desde otra app
// (WhatsApp, Archivos…). No se borra al activar: lo lee y vacía la app.
const SHARE_CACHE = 'traindia-share-inbox';
const SHARE_KEY = './__shared-import';
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
  './views-nutrition.js',
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
    caches.open(CACHE_NAME).then((cache) =>
      // Precarga saltándose la caché HTTP, para guardar copias FRESCAS.
      Promise.all(ASSETS.map((u) =>
        fetch(new Request(u, { cache: 'reload' }))
          .then((r) => { if (r && r.ok) return cache.put(u, r); })
          .catch(() => {})
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== SHARE_CACHE).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const reqUrl = new URL(req.url);

  // ---- Destino de "Compartir" (share_target del manifest) ----
  // Llega un POST con el archivo desde WhatsApp/Archivos: lo guardamos en el buzón
  // y redirigimos a la app, que lo importa al arrancar. Así el usuario NO tiene que
  // buscar el fichero en el explorador de Android.
  if (req.method === 'POST' && reqUrl.searchParams.has('share-target')) {
    event.respondWith((async () => {
      try {
        const fd = await req.formData();
        const file = fd.get('file');
        const cache = await caches.open(SHARE_CACHE);
        if (file && file.arrayBuffer) {
          // Se guarda el binario tal cual + su nombre/tipo: la app decide si es un
          // export JSON (importar) o un documento (PDF, imagen…) que adjuntar.
          const buf = await file.arrayBuffer();
          await cache.put(SHARE_KEY, new Response(buf, {
            headers: {
              'Content-Type': file.type || 'application/octet-stream',
              'X-Share-Name': encodeURIComponent(file.name || 'archivo'),
            },
          }));
        } else {
          const text = fd.get('text') || '';
          if (text) await cache.put(SHARE_KEY, new Response(text, { headers: { 'Content-Type': 'text/plain' } }));
        }
      } catch (e) { /* si algo falla, entra igual y avisa la app */ }
      return Response.redirect(new URL('./?shared=1', self.location).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET') return;
  const url = reqUrl;
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    // Archivos de la app: NETWORK-FIRST sin caché HTTP. Con red siempre sirve lo
    // último (las actualizaciones se ven al recargar); sin red, tira de la caché.
    event.respondWith(
      fetch(req, { cache: 'reload' }).then((response) => {
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
