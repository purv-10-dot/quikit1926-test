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

test("admin can enter a weekly value on an existing KPI", async ({ page }) => {
  await page.goto("/kpi");

  // Wait for at least one KPI row to load
  await expect(page.getByRole("row").nth(1)).toBeVisible({ timeout: 10_000 });

  // Click any weekly value cell (we select the first cell in the week columns).
  // This relies on cells being keyboard-focusable / clickable in the table.
  const firstWeekCell = page.locator('[data-week="1"]').first();
  if (await firstWeekCell.count()) {
    await firstWeekCell.click();
  } else {
    // Fallback: use a Log button if the cell-click UX has changed
    await page.getByRole("button", { name: /log|update week/i }).first().click();
  }

  // The LogModal (or cell popover) should open an input
  const input = page.getByRole("spinbutton").or(page.getByRole("textbox")).first();
  await input.fill("42");
  await page.getByRole("button", { name: /save|log/i }).click();

  // The cell should update — assert the new value is visible somewhere
  await expect(page.getByText("42").first()).toBeVisible({ timeout: 5_000 });
});
