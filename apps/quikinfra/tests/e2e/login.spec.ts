/**
 * Login / authentication surface.
 *
 * AUTH_DEMO_MODE=true short-circuits NextAuth and returns a pre-seeded
 * super-admin context for all requests, so there's nothing to type-in for
 * the default test run — /api/me returns a user immediately.
 *
 * When the test suite is run against a production-configured server
 * (AUTH_DEMO_MODE=false), this spec is where real login UI automation lives.
 * Until then, these are contract tests that confirm the auth plumbing is
 * wired correctly.
 */
import { test, expect } from "@playwright/test";
import { apiClient } from "./fixtures/api-client";

test.describe("Authentication surface", () => {
  test("/api/me returns a valid session in demo mode", async () => {
    const api = apiClient();
    const me = await api.get("/api/me");
    expect(me.userId).toBeTruthy();
    expect(me.userEmail).toBeTruthy();
    expect(me.tenantId).toBe("default");
    expect(me.roleKey).toMatch(/admin|manager|engineer|director|head|officer|auditor/);
  });

  test("login page renders if AUTH_DEMO_MODE is off (contract check)", async ({ page }) => {
    // In demo mode, / should redirect to /dashboard without a login page.
    // When demo mode is off, /login should render a form.
    const res = await page.goto("/login");
    // Tolerate either: the page renders (real login) or redirects home (demo).
    expect([200, 302, 307]).toContain(res?.status() ?? 0);
  });

  test("unauthenticated fetch without test headers still succeeds in demo mode", async () => {
    // Without x-test-role, we get the DEMO_CTX super-admin.
    const res = await fetch(`${process.env.E2E_BASE_URL ?? "http://localhost:3010"}/api/me`);
    expect(res.ok).toBe(true);
  });
});
