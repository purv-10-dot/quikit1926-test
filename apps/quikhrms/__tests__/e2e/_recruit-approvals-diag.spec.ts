import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/** THROWAWAY diagnostic — Recruit ▸ Approve Requisitions (list, details, edit, reject, approve). */
const DIR = "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";

test("recruit approvals — details/edit/reject/approve", async ({ page }) => {
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
  const snap = () => ({ p: pageErrors.length, n: netErrors.length, c: consoleErrors.length });
  const since = (s: { p: number; n: number; c: number }) => ({
    pageErrors: pageErrors.slice(s.p), netErrors: netErrors.slice(s.n), consoleErrors: consoleErrors.slice(s.c),
  });
  const modal = () => page.locator('.z-\\[60\\]').first();

  // ---- 1. LIST ----
  const resp = await page.goto("/recruit/approvals", { waitUntil: "networkidle" }).catch((e) => { pageErrors.push("goto: " + e.message); return null; });
  await page.waitForTimeout(1500);
  const approveCount = await page.locator("main button", { hasText: /^\s*Approve\s*$/i }).count();
  report.list = {
    status: resp?.status() ?? null,
    pendingApproveButtons: approveCount,
    bodyPreview: (await page.locator("body").innerText().catch(() => "")).slice(0, 200),
    loadErrors: { pageErrors: [...pageErrors], netErrors: [...netErrors], consoleErrors: [...consoleErrors] },
  };
  await page.screenshot({ path: path.join(DIR, "approvals-list.png"), fullPage: true });

  // ---- 2. DETAILS modal (non-destructive) ----
  const details: Record<string, unknown> = {};
  const dBtn = page.locator("main button", { hasText: /details/i }).first();
  details.found = await dBtn.count();
  if (details.found) {
    const s = snap();
    await dBtn.click({ timeout: 4000 }).catch((e) => { details.clickError = String(e).split("\n")[0]; });
    await page.waitForTimeout(600);
    details.modalOpened = await modal().isVisible().catch(() => false);
    await page.screenshot({ path: path.join(DIR, "approvals-details.png") });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    Object.assign(details, since(s));
  }
  report.details = details;

  // ---- 3. EDIT modal (non-destructive) ----
  const edit: Record<string, unknown> = {};
  const eBtn = page.locator("main button", { hasText: /^\s*edit\s*$/i }).first();
  edit.found = await eBtn.count();
  if (edit.found) {
    const s = snap();
    await eBtn.click({ timeout: 4000 }).catch((e) => { edit.clickError = String(e).split("\n")[0]; });
    await page.waitForTimeout(800);
    edit.modalOpened = await modal().isVisible().catch(() => false);
    await page.screenshot({ path: path.join(DIR, "approvals-edit.png") });
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(300);
    Object.assign(edit, since(s));
  }
  report.edit = edit;

  // ---- 4. REJECT (real — with comment) on the first pending item ----
  await page.goto("/recruit/approvals", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const reject: Record<string, unknown> = {};
  const rBtn = page.locator("main button", { hasText: /^\s*Reject\s*$/i }).first();
  reject.found = await rBtn.count();
  if (reject.found) {
    const s = snap();
    await rBtn.click({ timeout: 4000 }).catch((e) => { reject.openError = String(e).split("\n")[0]; });
    await page.waitForTimeout(600);
    reject.modalOpened = await modal().isVisible().catch(() => false);
    // fill comment
    const ta = modal().locator("textarea").first();
    if (await ta.count()) await ta.fill("QA automated rejection — budget/timing.").catch(() => {});
    await page.screenshot({ path: path.join(DIR, "approvals-reject.png") });
    // submit (the modal's Reject button)
    const submit = modal().locator("button", { hasText: /^\s*Reject\s*$/i }).last();
    await submit.click({ timeout: 4000 }).catch((e) => { reject.submitError = String(e).split("\n")[0]; });
    await page.waitForTimeout(1500);
    reject.modalClosed = !(await modal().isVisible().catch(() => true));
    Object.assign(reject, since(s));
  }
  report.reject = reject;

  // ---- 5. APPROVE (real — one click) on a fresh load ----
  await page.goto("/recruit/approvals", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const approve: Record<string, unknown> = {};
  const aBtn = page.locator("main button", { hasText: /^\s*Approve\s*$/i }).first();
  approve.found = await aBtn.count();
  if (approve.found) {
    const s = snap();
    await aBtn.click({ timeout: 4000 }).catch((e) => { approve.clickError = String(e).split("\n")[0]; });
    await page.waitForTimeout(2000);
    approve.urlAfter = page.url();
    approve.redirectedToRequisitions = page.url().includes("/recruit/requisitions");
    await page.screenshot({ path: path.join(DIR, "approvals-approve.png") });
    Object.assign(approve, since(s));
  }
  report.approve = approve;

  fs.writeFileSync(path.join(DIR, "approvals-report.json"), JSON.stringify(report, null, 2));
  console.log("\n===APPROVALS_REPORT_START===\n" + JSON.stringify(report, null, 2) + "\n===APPROVALS_REPORT_END===\n");
});
