// Vite: servidor de desarrollo y vista previa en 127.0.0.1:5175 (solo local). Sin proxy: el frontend habla
// con el API en SU origen (VITE_API_URL), igual que en producción (cuaderno.<dominio> → api-cuaderno.<dominio>).
// Por defecto, el backend de desarrollo en http://127.0.0.1:4200: mismo sitio que 127.0.0.1:5175, así que
// la cookie de refresco (SameSite=Strict, Path=/api/auth) viaja con credentials "include" y el CORS del
// backend (APP_URL=http://127.0.0.1:5175).
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import { origenApiDelBuild, politica } from './scripts/lib/csp.mjs';
import { listaPrecache, versionDe } from './scripts/sw-precache.mjs';

const servidor = {
  host: '127.0.0.1',
  port: 5175,
  strictPort: true,
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

/**
 * La CSP (scripts/lib/csp.mjs) como <meta> en el index.html del BUILD: aplica a lo que se sirve (vista
 * previa o cualquier servidor estático). En desarrollo no: Vite inyecta los estilos de la app como <style>
 * en línea. frame-ancestors no funciona en <meta>: va en la cabecera del despliegue.
 * @returns {import('vite').Plugin}
 */
/** @param {string} csp */
function politicaDeContenido(csp) {
  return {
    name: 'cuaderno-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => ({
  server: servidor,
  preview: servidor,
  plugins: [serviceWorker(), politicaDeContenido(politica(origenApiDelBuild(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL, { enVercel: process.env.VERCEL === '1' })))],
  build: {
    // El manifiesto dice qué archivo sale de cada módulo: scripts/presupuestos.mjs lo usa para medir el
    // JS de primera carga y el de cada rol.
    manifest: true,
    target: 'es2023',
    // Ninguna fuente se incrusta como data: (font-src 'self'; decisión escrita del bloque R): sale como
    // archivo propio. Lo demás sigue el límite por defecto de Vite.
    assetsInlineLimit: (archivo) => (/\.(woff2?|ttf|otf|eot)$/i.test(archivo) ? false : undefined),
    sourcemap: false,
  },
}));
