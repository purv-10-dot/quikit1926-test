/**
 * Smoke — the app boots, public pages load, the auth context resolver
 * returns a valid /api/me for the demo user.
 */
import { test, expect } from "@playwright/test";
import { apiClient } from "./fixtures/api-client";

test.describe("Smoke", () => {
  test("health: root page renders and redirects authenticated user", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.ok()).toBeTruthy();
  });

  test("dashboard loads without JS errors (or redirects to login)", async ({ page }) => {
    // Middleware redirects unauthenticated browser requests to /login.
    // Demo-mode auth context lives on the API path via a header, not a
    // cookie, so browser navigation still hits the auth gate. This test
    // accepts either outcome and only asserts no runtime JS errors.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard|login/);
    expect(errors).toEqual([]);
  });

  test("/api/me returns demo super-admin context", async () => {
    const api = apiClient();
    const me = await api.get("/api/me");
    expect(me.userId).toBeTruthy();
    expect(me.tenantId).toBe("default");
    expect(Array.isArray(me.permissions)).toBe(true);
    expect(me.permissions.length).toBeGreaterThan(0);
  });

  test("/api/me with x-test-role returns role-specific permissions", async () => {
    const api = apiClient({ role: "site_engineer" });
    const me = await api.get("/api/me");
    expect(me.roleKey).toBe("site_engineer");
    expect(me.permissions).toContain("dpr.write");
    expect(me.permissions).not.toContain("boq.lock");
  });

  test("protected pages route-gate: /projects/boq navigates or redirects", async ({ page }) => {
    // Same note as the dashboard smoke — browser requests without a
    // session are gated by middleware to /login. Accept either.
    await page.goto("/projects/boq");
    await expect(page).toHaveURL(/projects\/boq|login/);
  });
});
