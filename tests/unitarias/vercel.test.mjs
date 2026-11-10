// Configuración de Vercel (vercel.json): frame-ancestors como CABECERA (en <meta> no funciona), HSTS, nosniff
// y la caché de los assets con hash frente a lo que los apunta (index.html y el Service Worker /sw.js).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** @type {{ headers: { source: string, headers: { key: string, value: string }[] }[], [clave: string]: unknown }} */
const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

/**
 * Cabeceras que Vercel aplicaría a `ruta` (todas las reglas cuyo source coincide, en orden).
 * @param {string} ruta
 */
function cabecerasDe(ruta) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const regla of config.headers) {
    if (new RegExp(`^${regla.source}$`).test(ruta)) for (const { key, value } of regla.headers) out[key.toLowerCase()] = value;
  }
  return out;
}

describe('vercel.json', () => {
  it('npm ci + npm run build (con su control de tamaño en el CI) y publica dist', () => {
    expect(config).toMatchObject({ framework: 'vite', installCommand: 'npm ci', buildCommand: 'npm run build', outputDirectory: 'dist' });
  });

  it('sin variables ni dominios: VITE_API_URL va en el proyecto de Vercel', () => {
    expect(config.env).toBeUndefined();
    expect(config.build).toBeUndefined();
    expect(JSON.stringify(config)).not.toMatch(/VITE_API_URL|https?:\/\/(?!openapi\.vercel\.sh)/);
  });

  it('router por hash: sin rewrites ni redirects', () => {
    expect(config.rewrites).toBeUndefined();
    expect(config.redirects).toBeUndefined();
  });

  it("toda respuesta: frame-ancestors 'none', X-Frame-Options DENY, nosniff, HSTS y COOP", () => {
    for (const ruta of ['/', '/index.html', '/assets/index-abc123.js', '/sw.js', '/licencias/jetbrains-mono-OFL.txt']) {
      const h = cabecerasDe(ruta);
      expect(h['content-security-policy'], ruta).toBe("frame-ancestors 'none'");
      expect(h['x-frame-options'], ruta).toBe('DENY');
      expect(h['x-content-type-options'], ruta).toBe('nosniff');
      expect(h['strict-transport-security'], ruta).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
      expect(h['cross-origin-opener-policy'], ruta).toBe('same-origin');
    }
  });

  it('la CSP de cabecera solo agrega frame-ancestors (la completa sigue en el <meta> del build)', () => {
    expect(cabecerasDe('/')['content-security-policy']).not.toMatch(/default-src|script-src|connect-src/);
  });

  it('sin micrófono, cámara ni ubicación (Cuaderno no los usa)', () => {
    expect(cabecerasDe('/')['permissions-policy']).toBe('camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  });

  it('assets con hash: inmutables por un año; index.html y sw.js se revalidan siempre', () => {
    expect(cabecerasDe('/assets/KaTeX_AMS-Regular-BQhdFMY1.woff2')['cache-control']).toBe('public, max-age=31536000, immutable');
    for (const ruta of ['/', '/index.html', '/sw.js']) expect(cabecerasDe(ruta)['cache-control'], ruta).toBe('no-cache');
    expect(cabecerasDe('/licencias/jetbrains-mono-OFL.txt')['cache-control']).toBeUndefined();
  });
});
