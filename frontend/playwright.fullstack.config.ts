import { defineConfig } from '@playwright/test';

/** Frontend in API mode + the real Express backend (in-memory repository). */
export default defineConfig({
  testDir: './e2e-fullstack',
  reporter: 'list',
  workers: 1,
  use: { baseURL: 'http://localhost:5198', channel: 'chrome', timezoneId: 'Europe/Tallinn', viewport: { width: 1440, height: 1024 } },
  webServer: [
    { command: 'node e2e-fullstack/start-backend.mjs', url: 'http://localhost:3001/api/config', reuseExistingServer: false },
    { command: 'npx vite --port 5198 --strictPort', url: 'http://localhost:5198', reuseExistingServer: false },
  ],
});
