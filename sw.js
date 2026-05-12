// =============================================
// ECA · sw.js  (Service Worker)
// Estrategia:
//   - Archivos estáticos → Cache First (instalados al activar)
//   - Peticiones a Google Apps Script → Network Only
//     (la cola offline se maneja en core/sync.js, no aquí)
// Para agregar archivos al cache: agregar a STATIC_ASSETS.
// =============================================

const CACHE_NAME  = 'eca-v1';
const SCRIPT_HOST = 'script.google.com';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/base.css',
  '/app.js',
  '/core/api.js',
  '/core/cache.js',
  '/core/idb.js',
  '/core/sync.js',
  '/core/store.js',
  '/core/theme.js',
  '/core/ui.js',
  '/core/utils.js',
  '/db/articulos.db.js',
  '/db/categorias.db.js',
  '/db/clientes.db.js',
  '/db/cotizaciones.db.js',
  '/db/descuentos.db.js',
  '/db/impuestos.db.js',
  '/modules/articulos.js',
  '/modules/categorias.js',
  '/modules/clientes.js',
  '/modules/cotizacion.js',
  '/modules/descuentos.js',
  '/modules/impuestos.js',
  '/modules/proyectos.js',
];

// ── INSTALL: pre-cachear todos los assets estáticos ──────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: limpiar caches viejos ──────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: Cache First para estáticos, pass-through para API ─────────────────
self.addEventListener('fetch', (e) => {
  // Peticiones a Google Apps Script: dejar pasar siempre (sync.js maneja offline)
  if (e.request.url.includes(SCRIPT_HOST)) return;

  // Solo interceptar GET
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      // Si no está en cache, ir a red y cachear la respuesta
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
