import { test, expect } from "@playwright/test";

/**
 * Dashboard — end-to-end.
 *
 * Runs against the DEV-BYPASS test server (see playwright.config.ts): SSO is
 * off, so /dashboard loads directly with the header-based dev identity. These
 * are structural checks (shell, greeting, nav, no crash) — tolerant of whatever
 * data the local DB holds.
 */
test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    // Act as an admin for the dev header flow (used by API calls).
    await page.addInitScript(() => {
      try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ }
    });
  });

  test("loads without redirecting to login", async ({ page }) => {
    await page.goto("/dashboard");
    // We stayed on the dashboard (SSO bypass worked — not bounced to /login).
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("shows the welcome hero", async ({ page }) => {
    await page.goto("/dashboard");
    // Hero greeting from hero-banner.tsx ("Hi <name>," / "glad you're here").
    await expect(page.getByText(/glad you're here/i)).toBeVisible();
    await expect(page.getByText(/what's happening today/i)).toBeVisible();
  });

  test("renders the sidebar navigation", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");
    await expect(nav).toBeVisible();
    // Target links by href — robust whether the sidebar is collapsed (icon-only)
    // or expanded (with text labels).
    await expect(nav.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(nav.locator('a[href="/leaves"]')).toBeVisible();
    await expect(nav.locator('a[href="/attendance"]')).toBeVisible();
  });

  test("navigates from the sidebar (Todo)", async ({ page }) => {
    await page.goto("/dashboard");
    // Todo (/tasks) is a leaf link — no fly-out submenu — so clicking navigates.
    await page.getByRole("navigation").locator('a[href="/tasks"]').first().click();
    await expect(page).toHaveURL(/\/tasks/);
    await expect(page.locator("body")).toBeVisible();
  });

  test("has no fatal error boundary", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByText(/application error/i)).toHaveCount(0);
  });
});
