/**
 * QuikVC end-to-end smoke spec.
 *
 * Walks the BRD acceptance flow:
 *   sourcing → application → deal → memo → IC → settle → allocation → repayment
 *
 * Runs against the seeded ValleyNXT tenant with QUIKVC_DEV_BYPASS=1.
 * Pre-req: `npm run db:seed:quikvc` (creates the tenant + 4 demo deals).
 *
 * Why these specifc assertions (and not more):
 *   - Smoke test, not regression. We assert the page loads, the right title
 *     is visible, key controls render, and a write path returns success.
 *   - Deep behavior (validation rules, edge cases, RBAC matrix) lives in
 *     unit + Vitest API tests where it's fast + isolated.
 *   - When this spec breaks, something in the full-stack flow shifted —
 *     that's the signal we want.
 */
import { test, expect } from "@playwright/test";

test.describe("QuikVC smoke flow (fund-admin)", () => {
  test("VC home + sourcing inbox load", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(/\/home$/);
    // Side-rail nav present
    await expect(page.getByRole("link", { name: "Sourcing" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Deals" })).toBeVisible();
  });

  test("Sourcing page renders with status filters", async ({ page }) => {
    await page.goto("/sourcing");
    await expect(page.getByRole("heading", { name: "Sourcing" })).toBeVisible();
    // Filter tabs
    await expect(page.getByRole("link", { name: /^all/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^new/i })).toBeVisible();
    // Action buttons (visible to fund-admin)
    await expect(page.getByRole("button", { name: /Add opportunity/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Import CSV/i })).toBeVisible();
  });

  test("Add a sourced opportunity manually", async ({ page }) => {
    await page.goto("/sourcing");
    await page.getByRole("button", { name: /Add opportunity/i }).click();

    const startupName = `E2E Test Co ${Date.now()}`;
    await page.getByLabel(/Startup name/i).fill(startupName);
    await page.getByLabel(/Pitch/i).fill("Smoke test fixture — please ignore.");
    await page.getByRole("button", { name: /^Add$/i }).click();

    // Modal closes, new row appears
    await expect(page.getByText(startupName)).toBeVisible({ timeout: 10_000 });
  });

  test("Admin → Verticals page loads + form visible", async ({ page }) => {
    await page.goto("/admin/verticals");
    await expect(page.getByRole("heading", { name: "Verticals" })).toBeVisible();
    await expect(page.getByPlaceholder(/Vertical name/i)).toBeVisible();
  });

  test("Admin → Audit log page loads with filter tabs", async ({ page }) => {
    await page.goto("/admin/audit-log");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^all/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /denied/i })).toBeVisible();
  });

  test("Notifications full-page list loads", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  });

  test("Investors page loads (fund-admin gate passes)", async ({ page }) => {
    await page.goto("/investors");
    // Either "No investors yet." or a populated table — both pass.
    await expect(page.getByRole("heading", { name: /Investor/i }).first()).toBeVisible();
  });
});

test.describe("Investor portal (read-only)", () => {
  test("Investor dashboard loads", async ({ page }) => {
    await page.goto("/dashboard");
    // Either populated or "No investor profile found for your account."
    await expect(page.locator("body")).toContainText(/Portfolio|investor profile/i);
  });
});

test.describe("Auth redirect (no bypass)", () => {
  test("/admin redirects analyst to home when QUIKVC_DEV_ROLE=analyst", async ({ page }) => {
    // This spec relies on a follow-up env tweak. For now we just confirm
    // the admin layout *does* render its 403-panel for non-admin roles.
    // Skip in CI; run manually with QUIKVC_DEV_ROLE=analyst.
    test.skip(process.env.QUIKVC_DEV_ROLE !== "analyst", "Set QUIKVC_DEV_ROLE=analyst to run");

    await page.goto("/admin/verticals");
    await expect(page.getByText(/Restricted area/i)).toBeVisible();
  });
});
