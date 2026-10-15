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
  // Scripts, pruebas y configuración: Node (las pruebas e2e también usan el navegador vía Playwright).
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.{js,mjs}', '*.config.js'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' },
    rules: { 'no-console': 'off' },
  },
];
