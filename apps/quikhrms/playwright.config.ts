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
    baseURL: "http://localhost:3019",
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

  // Dedicated test server on port 3019 in DEV-BYPASS mode: with
  // NEXT_PUBLIC_QUIKIT_URL empty, the middleware skips central-auth (no SSO
  // redirect), the client AuthGuard is dev-permissive, and API auth uses the
  // header-based dev flow. This lets e2e reach authenticated pages locally.
  // Runs on 3019 so it never collides with a real SSO dev server on 3009.
  webServer: {
    command: "npx next dev -p 3019",
    url: "http://localhost:3019",
    env: { NEXT_PUBLIC_QUIKIT_URL: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
