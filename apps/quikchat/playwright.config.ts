import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, realtimeHttpUrl } from "./__tests__/e2e/fixtures/auth";

/**
 * Playwright config for QuikChat.
 *
 * Notes specific to this app (modelled on `apps/quiklms/playwright.config.ts`,
 * with three deliberate departures called out below):
 *
 * - Specs live under `__tests__/e2e/` and end in `.spec.ts`. Vitest's `include`
 *   is `**\/*.test.{ts,tsx}` (see vitest.config.ts), so the two runners cannot
 *   see each other's files — no exclusion list needed on either side.
 *
 * - `webServer` runs `dev`, not `build && start`: we care about behaviour, and a
 *   production build of this app takes minutes.
 *
 * - DEPARTURE 1 — TWO webServers. QuikChat presence lives in Redis and the
 *   realtime gateway (`services/realtime`) is its only writer, so the app alone
 *   proves nothing about last-seen. Both are `reuseExistingServer`, so a normal
 *   dev session (app + gateway already running) is reused as-is.
 *
 * - DEPARTURE 2 — the gateway is gated on `/metrics`, not `/health`. `/health`
 *   returns 503 while Redis is unreachable, which would leave Playwright
 *   retrying a URL and eventually timing out with a message that says nothing
 *   about Redis. `/metrics` proves the process is up; the Redis check moves into
 *   the spec's preflight (`assertGatewayHealthy`), which can explain itself.
 *
 * - DEPARTURE 3 — default `test-results/` + `playwright-report/` output paths.
 *   The root .gitignore already covers both names; quiklms's custom
 *   `__tests__/e2e/.results/` is covered by no .gitignore at all.
 *
 * - No global auth setup project: sessions are minted per-test from
 *   `__tests__/e2e/fixtures/auth.ts`, so tests stay independent.
 *
 * Prerequisites: Postgres + Redis up, and the shared dev seed present (these
 * tests use the real dev-seed users — there is no separate E2E tenant yet).
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  testMatch: /.*\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  // NOT parallel, on purpose: these specs mutate SHARED dev-seed rows
  // (QcUserPresence for the fixture users). Two of them at once would fight over
  // one person's status.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: "ui",
      testMatch: /ui\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      command: "npm run dev",
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm run dev",
      cwd: "../../services/realtime",
      url: `${realtimeHttpUrl()}/metrics`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
