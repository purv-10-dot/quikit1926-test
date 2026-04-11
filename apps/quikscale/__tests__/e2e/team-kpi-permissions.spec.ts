import { test, expect } from "@playwright/test";

const MEMBER_EMAIL = "e2e-member@test.com";
const MEMBER_PASSWORD = "E2ETest123!";

test("plain member sees team KPIs but cannot edit them", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(MEMBER_EMAIL);
  await page.getByLabel(/password/i).fill(MEMBER_PASSWORD);
  await page.getByRole("button", { name: /sign in|log ?in/i }).click();
  await page.waitForURL(/\/(dashboard|select-org)/);

  await page.goto("/kpi/teams");
  await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10_000 });

  // The "+ Add KPI" button should not be visible for a plain member
  const addButton = page.getByRole("button", { name: /\+ add kpi|add team kpi/i });
  await expect(addButton).toHaveCount(0);

  // Edit / delete affordances should also be hidden
  const editButtons = page.getByRole("button", { name: /edit|delete/i });
  // Allow zero; allow some non-KPI edits (e.g., user profile) but not on KPI rows.
  // We specifically check the KPI table rows don't carry edit controls.
  const kpiRows = page.getByRole("row");
  const firstRow = kpiRows.nth(1);
  if (await firstRow.count()) {
    const rowEditButtons = firstRow.getByRole("button", { name: /edit|delete/i });
    await expect(rowEditButtons).toHaveCount(0);
  }
});
