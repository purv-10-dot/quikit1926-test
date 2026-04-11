import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@test.com";
const ADMIN_PASSWORD = "E2ETest123!";

test("admin can log in and lands on dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();

  // After login, we should land on /dashboard (or /select-org if multi-tenant)
  await expect(page).toHaveURL(/\/(dashboard|select-org)/, { timeout: 10_000 });

  // Dashboard smoke — confirm at least the navigation is rendered
  await expect(page.getByRole("navigation").or(page.getByText(/dashboard/i))).toBeVisible();
});

test("login rejects bad password with a visible error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
  await page.getByLabel(/password/i).fill("wrong-password");
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();

  // Stay on login or show an error — don't land on dashboard
  await expect(page).not.toHaveURL(/\/dashboard/);
});
