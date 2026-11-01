import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the BUILT app (`pnpm --filter app start`) and a REAL Postgres.
 * Nothing is mocked. Prerequisites (see docs/testing.md): migrations applied, `pnpm --filter app build` done.
 *
 * Required env: DATABASE_URL, DIRECT_URL (database name must contain test/e2e/ci/scratch, see e2e-seed.ts).
 * Everything else has a safe test default below.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const secret = process.env.AUTH_SECRET || 'e2e-dummy-auth-secret-not-a-real-secret-0123456789';

export const E2E_ENV = {
  AUTH_SECRET: secret,
  NEXTAUTH_SECRET: secret,
  AUTH_URL: BASE,
  NEXTAUTH_URL: BASE,
  WHINK_OWNER_EMAILS: 'e2e-owner@example.test',
  // No outbound delivery or model is configured on purpose: approving a message must record the approval and report "not configured".
  NODE_ENV: 'production',
};

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // E2E_START_COMMAND / E2E_START_CWD let a developer point at a different build directory; CI uses the default.
    command: process.env.E2E_START_COMMAND ?? `pnpm --filter app start -p ${PORT} -H 127.0.0.1`,
    cwd: process.env.E2E_START_CWD ?? '..',
    url: `${BASE}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...E2E_ENV, DATABASE_URL: process.env.DATABASE_URL ?? '', DIRECT_URL: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
