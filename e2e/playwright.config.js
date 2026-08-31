import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end acceptance suite.
 *
 * These tests drive the real frontend against the real API against a real
 * PostgreSQL database. Nothing is mocked - that is the point: the unit and
 * integration suites already prove the pieces, and this proves they are wired
 * together.
 *
 * The API is booted against its own `ems_e2e` database (created and seeded by
 * `global-setup.js`) so a run can never damage the demo data a reviewer is
 * looking at on port 5433/`ems`.
 */
const API_PORT = 4100
const WEB_PORT = 5273
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://ems:ems_local_password@localhost:5433/ems_e2e?schema=public'

export default defineConfig({
  testDir: './tests',
  // The suite shares one database, so tests run serially rather than racing
  // each other over the same leave balances.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      // The responsive suite asserts phone layout; it belongs to the mobile project.
      testIgnore: /responsive\.spec\.js/,
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
      testMatch: /responsive\.spec\.js/,
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      cwd: '../Employee Management Platform BackEnd',
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        DATABASE_URL: E2E_DATABASE_URL,
        JWT_ACCESS_SECRET: 'e2e_only_access_secret_0123456789abcdefghij',
        JWT_REFRESH_SECRET: 'e2e_only_refresh_secret_9876543210zyxwvutsrq',
        SEED_DEMO_PASSWORD: 'Passw0rd!23',
        LOG_LEVEL: 'silent',
        // Forced empty so the suite never makes a live Gemini call: E2E must be
        // deterministic, offline and free. The template path is what is asserted.
        GOOGLE_API_KEY: '',
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      cwd: '../Employee Management Platform FrontEnd',
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
})
