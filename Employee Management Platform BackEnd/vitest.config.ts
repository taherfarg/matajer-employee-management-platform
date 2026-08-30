import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // Integration tests share one database; run them serially.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
