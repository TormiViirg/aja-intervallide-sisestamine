/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Wall-clock maths must not depend on the machine running the tests.
    env: { TZ: 'America/New_York' },
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
