import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for QuikFlow. Mirrors apps/quikscale/playwright.config.ts.
 *
 * Critical choices:
 * - webServer uses `build && start`, NOT `dev`, to avoid HMR flake and
 *   dev-only error overlays intercepting clicks.
 * - Specs live under `__tests__/e2e/` to keep them separate from Vitest
 *   unit/component/api tests (which are excluded from Playwright's glob).
 * - Runs only on chromium by default; enable firefox/webkit when needed.
 *
 * Prerequisite (one-time, run manually):
 *   cd apps/quikflow && npx playwright install --with-deps chromium
 *
 * Prerequisite (every run):
 *   npm run db:seed:e2e   # seeds the shared e2e-tenant + users (repo root)
 */
export default defineConfig({
  testDir: "./__tests__/e2e",
  // /login is SSO-only with no form to automate (see app/login/page.tsx), so
  // specs opt into an authenticated session via
  // `test.use({ storageState: ".auth/e2e-admin.json" })` — global-setup.ts
  // mints a real NextAuth JWT session cookie for the seeded e2e-admin user.
  globalSetup: require.resolve("./__tests__/e2e/global-setup"),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3018",
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
    // Port 3014 is the app's own `npm run dev` port — using it here would
    // collide with a dev server already running locally, so the e2e preview
    // build gets a dedicated port. It must also avoid every OTHER app's dev
    // port: this was 3016, which became quiklms's dev port when quiklms moved
    // off the shared 3014 (see docs/13-app-ports-and-env.md), so a local
    // quiklms dev server would have silently served these e2e specs. 3018 is
    // unassigned (3015 = quikscale e2e, 3019 = quikhrms e2e).
    // The `.next` wipe guards against a stale middleware/edge bundle baking
    // in a NEXT_PUBLIC_* value from a prior build that used a different env.
    command:
      'node -e "require(\'fs\').rmSync(\'.next\',{recursive:true,force:true})" && npm run build && npx next start -p 3018',
    url: "http://localhost:3018",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { NEXTAUTH_URL: "http://localhost:3018" },
  },
});
