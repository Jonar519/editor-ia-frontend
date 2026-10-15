// Pruebas de punta a punta. No dependen del sistema, la red, la zona horaria, las rutas, el idioma ni
// la IP de quien las corre: zona e idioma fijos, servidor local de vista previa, sin servicios externos.
// Se corren en el contenedor oficial de Playwright para Linux (scripts\e2e.bat) antes de cada push.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5175',
    locale: 'es-MX',
    timezoneId: 'UTC',
    colorScheme: 'light',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  // Sirve el build (dist/), lo que se despliega, no el servidor de desarrollo.
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:5175',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
