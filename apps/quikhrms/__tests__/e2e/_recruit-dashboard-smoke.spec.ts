import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * THROWAWAY smoke check — Recruit Dashboard click-through.
 * Not a saved regression test; safe to delete. Runs on the DEV-BYPASS server.
 * Loads /recruit/dashboard as admin, then clicks every clickable element in the
 * page content (excluding the shared sidebar + top-nav chrome), capturing JS
 * errors, failed network calls, and console errors, attributed to each click.
 */
const REPORT = path.join(
  "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad",
  "recruit-dashboard-report.json",
);

test("recruit dashboard — click-through smoke", async ({ page }) => {
  test.setTimeout(240_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const netErrors: string[] = [];
  const findings: Array<{ el: string; issue: string; detail: string }> = [];

  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 400) netErrors.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  page.on("requestfailed", (r) => netErrors.push(`FAILED ${r.request().method()} ${r.url()} — ${r.failure()?.errorText ?? ""}`));

  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });

  // Bypass the first-run SetupGate overlay (empty test DB reports setup
  // incomplete, which otherwise blocks every non-settings page).
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }),
    }),
  );

  // ---- Load ----
  const resp = await page.goto("/recruit/dashboard", { waitUntil: "networkidle" }).catch((e) => { pageErrors.push("goto: " + e.message); return null; });
  const loadStatus = resp?.status() ?? null;
  const finalUrl = page.url();
  await page.waitForTimeout(2000);
  const bodyText = (await page.locator("body").innerText().catch(() => "")).slice(0, 400);
  const noAccess = /no access|don't have access|not authorized/i.test(bodyText);

  const loadConsole = [...consoleErrors];
  const loadPageErr = [...pageErrors];
  const loadNet = [...netErrors];

  // ---- Enumerate clickables in the page content (skip sidebar + top nav) ----
  const sel = 'main button, main a[href], main [role="button"], main [role="tab"], main [role="menuitem"]';
  const count = await page.locator(sel).count();

  for (let i = 0; i < count; i++) {
    const el = page.locator(sel).nth(i);
    // Skip the shared top-nav chrome (search/notifications/avatar).
    const inChrome = await el.evaluate((n) => !!(n as HTMLElement).closest(".hrms-topbar")).catch(() => false);
    if (inChrome) continue;
    if (!(await el.isVisible().catch(() => false))) continue;

    let label = `#${i}`;
    try {
      const txt = (await el.innerText({ timeout: 800 })).trim();
      label = (txt || (await el.getAttribute("aria-label")) || (await el.getAttribute("href")) || `#${i}`).slice(0, 50);
    } catch { /* keep #i */ }

    const before = page.url();
    const cB = consoleErrors.length, pB = pageErrors.length, nB = netErrors.length;

    try {
      await el.scrollIntoViewIfNeeded({ timeout: 800 }).catch(() => {});
      await el.click({ timeout: 3000 });
      await page.waitForTimeout(700);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      // Ignore benign "intercepts pointer events"/detached churn only if nothing else broke.
      findings.push({ el: label, issue: "click failed", detail: msg });
    }

    const newPage = pageErrors.slice(pB);
    const newNet = netErrors.slice(nB);
    const newConsole = consoleErrors.slice(cB);
    if (newPage.length) findings.push({ el: label, issue: "JS runtime error", detail: newPage.join(" | ").slice(0, 300) });
    if (newNet.length) findings.push({ el: label, issue: "network error", detail: newNet.join(" | ").slice(0, 400) });
    if (newConsole.length) findings.push({ el: label, issue: "console error", detail: newConsole.join(" | ").slice(0, 300) });

    // Close any modal, and return to the dashboard if we navigated away.
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(150);
    if (!page.url().includes("/recruit/dashboard")) {
      await page.goto("/recruit/dashboard", { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(600);
    }
    void before;
  }

  const report = { loadStatus, finalUrl, noAccess, bodyPreview: bodyText, clickablesFound: count, loadConsole, loadPageErr, loadNet, findings };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\n===RECRUIT_DASHBOARD_REPORT_START===\n" + JSON.stringify(report, null, 2) + "\n===RECRUIT_DASHBOARD_REPORT_END===\n");
});
