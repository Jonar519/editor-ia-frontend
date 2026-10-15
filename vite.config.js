// Vite: servidor de desarrollo y vista previa en 127.0.0.1:5175 (solo local). El API va por proxy en el
// mismo origen (/api → 127.0.0.1:4200): así la cookie de refresco, SameSite=Strict y con Path=/api/auth,
// viaja sin CORS.
import { defineConfig } from 'vite';

const servidor = {
  host: '127.0.0.1',
  port: 5175,
  strictPort: true,
  proxy: { '/api': { target: 'http://127.0.0.1:4200', changeOrigin: false } },
};

export default defineConfig({
  server: servidor,
  preview: servidor,
  build: {
    // El manifiesto dice qué archivo sale de cada módulo: scripts/presupuestos.mjs lo usa para medir el
    // JS de primera carga y el de cada rol.
    manifest: true,
    target: 'es2023',
    sourcemap: false,
  },
});
