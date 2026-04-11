import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@test.com";
const ADMIN_PASSWORD = "E2ETest123!";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/(dashboard|select-org)/);
});

test("admin can create an individual KPI from /kpi", async ({ page }) => {
  await page.goto("/kpi");
  await expect(page.getByRole("heading", { name: /kpi/i }).first()).toBeVisible();

  // Count existing KPI rows before create
  const rowsBefore = await page.getByRole("row").count();

  // Open the Add KPI modal
  await page.getByRole("button", { name: /add|new kpi|\+ add/i }).first().click();

  // Fill the form — use role-based queries to be robust to label changes
  await page.getByLabel(/name|kpi name/i).fill(`E2E KPI ${Date.now()}`);
  await page.getByLabel(/year|fiscal year/i).first().fill("2026").catch(() => {});
  await page.getByRole("button", { name: /save|create/i }).click();

  // After save, the modal should close and a new row should appear
  await page.waitForTimeout(500); // allow mutation + refetch
  const rowsAfter = await page.getByRole("row").count();
  expect(rowsAfter).toBeGreaterThan(rowsBefore);
});
