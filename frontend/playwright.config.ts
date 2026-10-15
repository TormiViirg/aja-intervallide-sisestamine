import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5199',
    // Uses the locally installed Chrome so no browser download is needed.
    channel: 'chrome',
    timezoneId: 'America/New_York',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1024 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npx vite --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
  },
});
