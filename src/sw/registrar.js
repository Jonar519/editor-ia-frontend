// Registra el Service Worker (src/sw/sw.js, emitido como /sw.js en el build). Solo en el build: en
// desarrollo interferiría con la recarga en caliente de Vite.

export function registrarServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err) => {
    console.warn('No se pudo registrar el Service Worker', err);
  });
}
