/* Service Worker de Cuaderno. Plantilla: el build (vite.config.js) reemplaza __VERSION__ y __PRECACHE__
 * y la emite como /sw.js. Es un script clásico (no módulo) para que funcione en todos los navegadores.
 *
 * Reglas:
 *   - /api NUNCA pasa por aquí: ni se cachea ni se sirve de caché (lleva tokens y datos personales;
 *     el backend ya responde Cache-Control: no-store).
 *   - Solo GET y del mismo origen. Lo demás va directo a la red.
 *   - Precarga solo el armazón (la página, la entrada, el CSS y las vistas públicas): sin red, la app
 *     abre y muestra un estado claro. El código de cada rol se cachea cuando esa persona lo usa, nunca
 *     antes: una persona lectora no descarga el editor en segundo plano.
 *   - Navegación: red primero (siempre la versión nueva); sin red, la página de la caché.
 *   - /assets/* (nombres con hash, inmutables): caché primero.
 */
/* global __PRECACHE__ */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `cuaderno-${VERSION}`;

/**
 * Qué hacer con una petición. Pura (sin efectos) para probarla aparte.
 * @param {{ url: string, metodo: string, modo: string, origen: string }} p
 * @returns {'ignorar' | 'red-primero' | 'cache-primero'}
 */
function estrategia(p) {
  if (p.metodo !== 'GET') return 'ignorar';
  const url = new URL(p.url);
  if (url.origin !== p.origen) return 'ignorar';
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return 'ignorar';
  if (url.pathname === '/sw.js') return 'ignorar';
  if (p.modo === 'navigate') return 'red-primero';
  if (url.pathname.startsWith('/assets/')) return 'cache-primero';
  return 'ignorar';
}

/** Solo se guarda una respuesta completa y correcta (nunca errores, redirecciones ni opacas). */
const guardable = (/** @type {Response} */ r) => r.status === 200 && r.type === 'basic';

self.addEventListener('install', (/** @type {any} */ ev) => {
  ev.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (/** @type {any} */ ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith('cuaderno-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (/** @type {any} */ ev) => {
  const req = ev.request;
  const que = estrategia({ url: req.url, metodo: req.method, modo: req.mode, origen: self.location.origin });
  if (que === 'ignorar') return;

  if (que === 'red-primero') {
    ev.respondWith(
      fetch(req).catch(async () => (await caches.match('/', { ignoreSearch: true, ignoreVary: true })) ?? Response.error()),
    );
    return;
  }

  // ignoreVary: el servidor responde "Vary: Origin" y los scripts de módulo mandan Origin mientras la
  // precarga no; sin esto la caché nunca coincide y la app no abre sin red. Es seguro aquí: /assets/*
  // es del mismo origen y su nombre lleva el hash del contenido (inmutable).
  ev.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (enCache) =>
        enCache ??
        fetch(req).then(async (r) => {
          if (guardable(r)) await (await caches.open(CACHE)).put(req, r.clone());
          return r;
        }),
    ),
  );
});
