// Vite: servidor de desarrollo y vista previa en 127.0.0.1:5175 (solo local). El API va por proxy en el
// mismo origen (/api → 127.0.0.1:4200): así la cookie de refresco, SameSite=Strict y con Path=/api/auth,
// viaja sin CORS.
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { listaPrecache, versionDe } from './scripts/sw-precache.mjs';

// CUADERNO_API (opcional): otro backend local para pruebas manuales, por ejemplo uno contra la base de
// PRUEBAS en el puerto 4201. Por defecto, el de desarrollo. Solo se acepta 127.0.0.1 (nunca un servidor
// remoto: la cookie de refresco viajaría a otro lado).
const api = process.env.CUADERNO_API ?? 'http://127.0.0.1:4200';
if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(api)) throw new Error('CUADERNO_API debe ser http://127.0.0.1:<puerto>');

const servidor = {
  host: '127.0.0.1',
  port: 5175,
  strictPort: true,
  // ws: también el WebSocket de /api/tiempo-real (bloque L), en el mismo origen.
  proxy: { '/api': { target: api, changeOrigin: false, ws: true } },
};

/**
 * Emite /sw.js desde la plantilla src/sw/sw.js con la versión y la lista de precarga de ESTE build.
 * @returns {import('vite').Plugin}
 */
function serviceWorker() {
  return {
    name: 'cuaderno-service-worker',
    apply: 'build',
    generateBundle(_opciones, bundle) {
      const archivos = Object.values(bundle).map((b) =>
        b.type === 'chunk'
          ? {
              archivo: b.fileName,
              tipo: /** @type {const} */ ('chunk'),
              esEntrada: b.isEntry,
              modulo: b.facadeModuleId,
              importaciones: b.imports,
              css: [...(b.viteMetadata?.importedCss ?? [])],
            }
          : { archivo: b.fileName, tipo: /** @type {const} */ ('asset') },
      );
      const plantilla = readFileSync(new URL('./src/sw/sw.js', import.meta.url), 'utf8');
      // Se reemplazan las LÍNEAS de código completas (los marcadores también aparecen en el comentario).
      const codigo = plantilla
        .replace("const VERSION = '__VERSION__';", `const VERSION = ${JSON.stringify(versionDe(Object.keys(bundle)))};`)
        .replace('const PRECACHE = __PRECACHE__;', `const PRECACHE = ${JSON.stringify(listaPrecache(archivos))};`);
      if (/const (VERSION|PRECACHE) = (?:'__VERSION__'|__PRECACHE__);/.test(codigo)) {
        this.error('sw.js: quedó un marcador sin reemplazar (¿cambió la plantilla?)');
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: codigo });
    },
  };
}

export default defineConfig({
  server: servidor,
  preview: servidor,
  plugins: [serviceWorker()],
  build: {
    // El manifiesto dice qué archivo sale de cada módulo: scripts/presupuestos.mjs lo usa para medir el
    // JS de primera carga y el de cada rol.
    manifest: true,
    target: 'es2023',
    sourcemap: false,
  },
});
