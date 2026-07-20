import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for QuikHRMS (dev port 3009).
 *
 * - Specs live under `__tests__/e2e/` (separate from Vitest tests).
 * - Runs on chromium by default.
 * - webServer: if a server is already running on 3009 (e.g. `npm run dev`),
 *   Playwright reuses it; otherwise it builds + starts one.
 *
 * One-time:  npx playwright install chromium
 * Run:       npm run e2e   (from apps/quikhrms)
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
    baseURL: "http://localhost:3009",
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
    // Use next directly (not `npm run dev`) — npm's workspace mode errors with
    // ENOWORKSPACES when Playwright spawns it. Reused if a server is already up.
    command: "npx next dev -p 3009",
    url: "http://localhost:3009",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
