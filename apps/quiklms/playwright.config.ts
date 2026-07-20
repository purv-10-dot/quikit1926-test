import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the QuikSkill LMS audit suite.
 *
 * Notes specific to this app:
 * - Specs live under `__tests__/e2e/`; Vitest owns `__tests__/{unit,api,components}`.
 *   The two must not overlap or each runner tries to execute the other's files.
 * - `webServer` runs `dev`, not `build && start`. The app has 92 pages and a
 *   production build takes minutes; for an audit we care about behaviour, not
 *   build output. Flip to `build && start` if you start chasing HMR flake.
 * - No global auth setup project: sessions are minted per-test from
 *   `fixtures/auth.ts`, so tests stay independent and can switch roles freely.
 * - Prerequisite: seed the fixture tenant first —
 *     cd packages/database && npx tsx prisma/seed-quiklms-e2e.ts
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [
    ["list"],
    ["json", { outputFile: "__tests__/e2e/.results/results.json" }],
    ["html", { outputFolder: "__tests__/e2e/.results/html", open: "never" }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3020",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
    // Surfaces server-side 500s as readable failures instead of blank pages.
    ignoreHTTPSErrors: true,
  },

  projects: [
    { name: "api", testMatch: /api\/.*\.spec\.ts$/ },
    {
      name: "ui",
      testMatch: /ui\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "security",
      testMatch: /security\/.*\.spec\.ts$/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3020/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
