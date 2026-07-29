import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/** THROWAWAY diagnostic — isolate whether Job Openings actions truly fail. */
const DIR = "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";

test("recruit requisitions — isolated action diagnostic", async ({ page }) => {
  test.setTimeout(180_000);
  const log: Record<string, unknown> = {};
  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }) }));

  await page.goto("/recruit/requisitions", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(DIR, "req-loaded.png"), fullPage: true });

  // Count rows actually rendered.
  log.rowCount = await page.locator("table tbody tr").count();

  // --- New Requisition, isolated ---
  const nb = page.locator("main button", { hasText: /new requisition/i }).first();
  log.newReq = {
    count: await nb.count(),
    visible: await nb.isVisible().catch(() => null),
    enabled: await nb.isEnabled().catch(() => null),
    box: await nb.boundingBox().catch(() => null),
  };
  try {
    await nb.click({ timeout: 5000 });
    await page.waitForTimeout(700);
    const modal = page.locator('.z-\\[60\\]').first();
    (log.newReq as Record<string, unknown>).modalOpened = await modal.isVisible().catch(() => false);
    await page.screenshot({ path: path.join(DIR, "req-newmodal.png") });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  } catch (e) {
    (log.newReq as Record<string, unknown>).clickError = e instanceof Error ? e.message.slice(0, 400) : String(e);
  }

  // --- First "View" action, isolated (fresh reload to avoid stacked state) ---
  await page.goto("/recruit/requisitions", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const view = page.locator('button[title="View"]').first();
  log.viewBtn = {
    count: await view.count(),
    visible: await view.isVisible().catch(() => null),
    enabled: await view.isEnabled().catch(() => null),
    box: await view.boundingBox().catch(() => null),
  };
  try {
    await view.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
    await view.click({ timeout: 5000 });
    await page.waitForTimeout(700);
    const modal = page.locator('.z-\\[60\\]').first();
    (log.viewBtn as Record<string, unknown>).modalOpened = await modal.isVisible().catch(() => false);
    await page.screenshot({ path: path.join(DIR, "req-viewmodal.png") });
  } catch (e) {
    (log.viewBtn as Record<string, unknown>).clickError = e instanceof Error ? e.message.slice(0, 400) : String(e);
  }

  fs.writeFileSync(path.join(DIR, "req-diag.json"), JSON.stringify(log, null, 2));
  console.log("\n===REQ_DIAG_START===\n" + JSON.stringify(log, null, 2) + "\n===REQ_DIAG_END===\n");
});
