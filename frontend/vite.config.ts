/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    server: {
      // The Express backend (backend/, `npm start`) listens on 3001; same-origin keeps the tz cookie.
      proxy: { '/api': { target: env.VITE_API_PROXY_TARGET ?? 'http://localhost:3001', changeOrigin: true } },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Wall-clock maths must not depend on the machine running the tests.
      env: { TZ: 'America/New_York' },
    },
  };
});
