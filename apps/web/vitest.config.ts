import { defineConfig } from 'vitest/config';

/** Smoke tests na spec 001; suites Nuxt completas na spec 004. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});