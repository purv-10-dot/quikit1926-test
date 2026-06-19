import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for QuikVC.
 *
 * Mirrors apps/quikscale/playwright.config.ts conventions:
 *   - webServer uses `build && start`, not `dev` (avoids HMR flake)
 *   - Specs in __tests__/e2e/, excluded from Vitest's glob
 *   - Chromium-only by default
 *
 * Prerequisite (one-time):
 *   cd apps/quikvc && npx playwright install --with-deps chromium
 *
 * Prerequisite (every run):
 *   npm run db:seed:quikvc   # seeds ValleyNXT tenant + 4 sprint demo deals
 *
 * The smoke spec runs with QUIKVC_DEV_BYPASS=1 so we don't need a real
 * NextAuth login flow. To exercise real auth instead, drop the env var
 * and arrange for the spec to log in via the credentials provider first.
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: false, // shared dev-bypass tenant — keep serial to avoid races
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3008",
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
    url: "http://localhost:3008",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      // Demo bypass for the smoke run — see lib/dev-session.ts.
      QUIKVC_DEV_BYPASS: "1",
      // Tests will switch this between specs to exercise different roles.
      QUIKVC_DEV_ROLE: "fund-admin",
    },
  },
});
