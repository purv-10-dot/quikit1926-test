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

test("OPSP Rocks round-trips through a full reload", async ({ page }) => {
  await page.goto("/opsp");
  await expect(page.getByText(/opsp|one page strategic plan|rocks/i).first()).toBeVisible({ timeout: 10_000 });

  const stamp = `E2E Rock ${Date.now()}`;

  // Find the Rocks table's first priority cell and type a value
  const rocksInput = page
    .locator('input[placeholder*="priority" i], input[placeholder*="rock" i]')
    .first();
  await rocksInput.fill(stamp);

  // Save — the OPSP page autosaves or has an explicit Save button
  const saveBtn = page.getByRole("button", { name: /save|apply/i }).first();
  if (await saveBtn.count()) {
    await saveBtn.click();
  }

  // Wait a moment for the PUT to settle, then reload
  await page.waitForTimeout(1_000);
  await page.reload();

  // The stamp should still be present on the page
  await expect(page.getByText(stamp)).toBeVisible({ timeout: 10_000 });
});
