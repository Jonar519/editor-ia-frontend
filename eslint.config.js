import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/', 'coverage/', 'reports/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Código del navegador.
  { files: ['src/**/*.js'], languageOptions: { globals: { ...globals.browser }, sourceType: 'module' } },
  // Service Worker: script clásico con los globales del worker.
  { files: ['src/sw/sw.js'], languageOptions: { globals: { ...globals.serviceworker }, sourceType: 'script' } },
  // Scripts, pruebas y configuración: Node.
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' },
    rules: { 'no-console': 'off' },
  },
  // Las pruebas e2e evalúan funciones DENTRO del navegador (page.evaluate): también sus globales.
  { files: ['tests/e2e/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
