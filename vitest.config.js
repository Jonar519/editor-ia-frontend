// Pruebas unitarias (Node, sin navegador). Las de punta a punta (tests/e2e) son de Playwright.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unitarias/**/*.test.mjs'],
    environment: 'node',
  },
});
