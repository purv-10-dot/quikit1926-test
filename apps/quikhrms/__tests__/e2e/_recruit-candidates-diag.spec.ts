import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/** THROWAWAY diagnostic — Recruit ▸ Candidates (list, Add form, detail page). */
const DIR = "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";

test("recruit candidates — list, add, detail", async ({ page }) => {
  test.setTimeout(200_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const netErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("requestfailed", (r) => netErrors.push(`FAILED ${r.request().method()} ${r.url()} — ${r.failure()?.errorText ?? ""}`));
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) {
      let b = ""; try { b = (await r.text()).slice(0, 200); } catch { /* ignore */ }
      netErrors.push(`${r.status()} ${r.request().method()} ${r.url()} :: ${b}`);
    }
  });

  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }) }));

  const report: Record<string, unknown> = {};

  // ---- 1. LIST ----
  const resp = await page.goto("/recruit/candidates", { waitUntil: "networkidle" }).catch((e) => { pageErrors.push("goto: " + e.message); return null; });
  await page.waitForTimeout(1500);
  report.list = {
    status: resp?.status() ?? null,
    rowCount: await page.locator("table tbody tr").count().catch(() => -1),
    consoleErrors: [...consoleErrors],
    pageErrors: [...pageErrors],
    netErrors: [...netErrors],
  };
  await page.screenshot({ path: path.join(DIR, "candidates-list.png"), fullPage: true });

  // ---- 2. ADD CANDIDATE (isolated) ----
  const addBtn = page.locator("main button", { hasText: /add candidate/i }).first();
  const add: Record<string, unknown> = { found: await addBtn.count() };
  const p0 = pageErrors.length, n0 = netErrors.length, c0 = consoleErrors.length;
  if (add.found) {
    try {
      await addBtn.click({ timeout: 5000 });
      await page.waitForTimeout(700);
      add.modalOpened = await page.locator('.z-\\[60\\]').first().isVisible().catch(() => false);
      await page.screenshot({ path: path.join(DIR, "candidates-add.png") });
      await page.keyboard.press("Escape").catch(() => {});
    } catch (e) { add.clickError = e instanceof Error ? e.message.slice(0, 300) : String(e); }
  }
  add.newPageErrors = pageErrors.slice(p0);
  add.newNetErrors = netErrors.slice(n0);
  add.newConsole = consoleErrors.slice(c0);
  report.addCandidate = add;

  // ---- 3. CANDIDATE DETAIL (isolated, fresh) ----
  await page.goto("/recruit/candidates", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const firstLink = page.locator('a[href^="/recruit/candidates/"]').first();
  const href = (await firstLink.count()) ? await firstLink.getAttribute("href") : null;
  const detail: Record<string, unknown> = { firstCandidateHref: href };
  const p1 = pageErrors.length, n1 = netErrors.length, c1 = consoleErrors.length;
  if (href) {
    const dresp = await page.goto(href, { waitUntil: "networkidle" }).catch((e) => { pageErrors.push("detail goto: " + e.message); return null; });
    await page.waitForTimeout(1500);
    detail.status = dresp?.status() ?? null;
    detail.finalUrl = page.url();
    detail.bodyPreview = (await page.locator("body").innerText().catch(() => "")).slice(0, 200);
    detail.newPageErrors = pageErrors.slice(p1);
    detail.newNetErrors = netErrors.slice(n1);
    detail.newConsole = consoleErrors.slice(c1);
    await page.screenshot({ path: path.join(DIR, "candidate-detail.png"), fullPage: true });
  } else {
    detail.error = "No candidate link found on the list.";
  }
  report.detail = detail;

  fs.writeFileSync(path.join(DIR, "candidates-report.json"), JSON.stringify(report, null, 2));
  console.log("\n===CAND_REPORT_START===\n" + JSON.stringify(report, null, 2) + "\n===CAND_REPORT_END===\n");
});
