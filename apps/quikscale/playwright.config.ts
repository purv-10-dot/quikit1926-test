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
  // Mints a NextAuth session-cookie storageState for the seeded e2e-admin
  // (see global-setup.ts) — /login is SSO-only with no form to automate, so
  // specs that need an authenticated session opt in via
  // `test.use({ storageState: ".auth/e2e-admin.json" })` instead of driving
  // the UI login. login.spec.ts intentionally stays unauthenticated (no
  // storageState) since it exercises the login page itself.
  globalSetup: require.resolve("./__tests__/e2e/global-setup"),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 2 : 0,
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: "http://localhost:3015",
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
    // Port 3002 is reserved for the `admin` app's dev server locally — use a
    // dedicated port for the e2e preview build so the two never collide.
    // `npx next start -p 3015` bypasses the package.json `start` script,
    // which hardcodes -p 3002. The `.next` wipe guards against a stale
    // middleware/edge bundle baking in a NEXT_PUBLIC_* value from a prior
    // build that used a different env (bit us once: a cached build kept an
    // old NEXT_PUBLIC_AUTH_URL, silently changing the auth redirect target).
    command:
      'node -e "require(\'fs\').rmSync(\'.next\',{recursive:true,force:true})" && npm run build && npx next start -p 3015',
    url: "http://localhost:3015",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { NEXTAUTH_URL: "http://localhost:3015" },
  },
});
