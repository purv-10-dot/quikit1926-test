import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/** THROWAWAY diagnostic — Recruit ▸ Interviews (list + schedule/feedback/reschedule modals). */
const DIR = "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";
const shot = (p: string) => path.join(DIR, "interviews-" + p);

test("recruit interviews — list + modals", async ({ page }) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const netErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("/api/") && !r.url().includes("/api/auth/")) {
      let b = ""; try { b = (await r.text()).slice(0, 160); } catch { /* ignore */ }
      netErrors.push(`${r.status()} ${r.request().method()} ${r.url().split("/api/")[1]} :: ${b}`);
    }
  });

  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }) }));

  const report: Record<string, unknown> = {};
  const modal = () => page.locator('.z-\\[60\\]').first();
  const openClose = async (label: string, btn: import("@playwright/test").Locator, file: string) => {
    const res: Record<string, unknown> = { found: await btn.count() };
    if (res.found) {
      const p0 = pageErrors.length, n0 = netErrors.length;
      await btn.click({ timeout: 4000 }).catch((e) => (res.clickError = String(e).split("\n")[0]));
      await page.waitForTimeout(700);
      res.modalOpened = await modal().isVisible().catch(() => false);
      await page.screenshot({ path: shot(file) });
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(300);
      res.newPageErrors = pageErrors.slice(p0);
      res.newNetErrors = netErrors.slice(n0);
    }
    report[label] = res;
  };

  // 1. LIST
  const resp = await page.goto("/recruit/interviews", { waitUntil: "domcontentloaded" }).catch((e) => { pageErrors.push("goto: " + e.message); return null; });
  await page.waitForTimeout(2000);
  report.list = {
    status: resp?.status() ?? null,
    rowCount: await page.locator("table tbody tr").count().catch(() => -1),
    bodyPreview: (await page.locator("body").innerText().catch(() => "")).slice(0, 160),
    loadErrors: { pageErrors: [...pageErrors], netErrors: [...netErrors], consoleErrors: [...consoleErrors] },
  };
  await page.screenshot({ path: shot("01-list.png"), fullPage: true });

  // 2. Schedule Interview (open form)
  await openClose("scheduleForm", page.locator("main button", { hasText: /schedule interview|schedule|new interview/i }).first(), "02-schedule.png");

  // 3. First interview row — Feedback
  await openClose("feedbackModal", page.locator("main button", { hasText: /feedback/i }).first(), "03-feedback.png");

  // 4. Reschedule
  await openClose("rescheduleModal", page.locator("main button", { hasText: /reschedule/i }).first(), "04-reschedule.png");

  report.consoleErrorsTotal = consoleErrors.length;
  fs.writeFileSync(path.join(DIR, "interviews-report.json"), JSON.stringify(report, null, 2));
  console.log("\n===INTV_START===\n" + JSON.stringify(report, null, 2) + "\n===INTV_END===\n");
});
