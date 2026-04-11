import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for QuikScale.
 *
 * Critical choices:
 * - webServer uses `build && start`, NOT `dev`, to avoid HMR flake and
 *   dev-only error overlays intercepting clicks.
 * - Specs live under `__tests__/e2e/` to keep them separate from Vitest
 *   unit/component tests (which are excluded from Playwright's glob).
 * - Runs only on chromium by default; enable firefox/webkit when needed.
 *
 * Prerequisite (one-time, run manually):
 *   cd apps/quikscale && npx playwright install --with-deps chromium
 *
 * Prerequisite (every run):
 *   npm run db:seed:e2e   # seeds the e2e tenant + users
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3004",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3004",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
