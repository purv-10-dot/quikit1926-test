import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * THROWAWAY smoke check — Recruit ▸ Job Openings / Requisitions (+ create form).
 * Runs on the DEV-BYPASS server. Loads the list, exercises list controls, opens
 * the "New Requisition" modal, tries an EMPTY submit (validation), then a FILLED
 * submit (capturing the save API result). Captures JS errors, failed API calls,
 * and console errors throughout. Safe to delete.
 */
const REPORT = path.join(
  "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad",
  "recruit-requisitions-report.json",
);

test("recruit requisitions — form & click-through", async ({ page }) => {
  test.setTimeout(240_000);

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const netErrors: string[] = [];
  const findings: Array<{ stage: string; el: string; issue: string; detail: string }> = [];

  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("requestfailed", (r) => netErrors.push(`FAILED ${r.request().method()} ${r.url()} — ${r.failure()?.errorText ?? ""}`));
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) {
      let body = "";
      try { body = (await r.text()).slice(0, 250); } catch { /* ignore */ }
      netErrors.push(`${r.status()} ${r.request().method()} ${r.url()} :: ${body}`);
    }
  });

  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }) }));

  const snap = () => ({ c: consoleErrors.length, p: pageErrors.length, n: netErrors.length });
  const diff = (stage: string, el: string, s: { c: number; p: number; n: number }) => {
    const np = pageErrors.slice(s.p), nn = netErrors.slice(s.n), nc = consoleErrors.slice(s.c);
    if (np.length) findings.push({ stage, el, issue: "JS runtime error", detail: np.join(" | ").slice(0, 300) });
    if (nn.length) findings.push({ stage, el, issue: "API/network error", detail: nn.join(" | ").slice(0, 450) });
    if (nc.length) findings.push({ stage, el, issue: "console error", detail: nc.join(" | ").slice(0, 250) });
  };

  // ---- 1. Load ----
  const resp = await page.goto("/recruit/requisitions", { waitUntil: "networkidle" }).catch((e) => { pageErrors.push("goto: " + e.message); return null; });
  const loadStatus = resp?.status() ?? null;
  await page.waitForTimeout(1500);
  const bodyPreview = (await page.locator("body").innerText().catch(() => "")).slice(0, 300);
  const loadErrors = { console: [...consoleErrors], page: [...pageErrors], net: [...netErrors] };

  // ---- 2. List-level controls (status chips / filters / buttons in main, not top-nav) ----
  const sel = 'main button, main a[href], main [role="button"], main [role="tab"]';
  const listCount = await page.locator(sel).count();
  for (let i = 0; i < listCount; i++) {
    const el = page.locator(sel).nth(i);
    if (await el.evaluate((n) => !!(n as HTMLElement).closest(".hrms-topbar")).catch(() => true)) continue;
    if (!(await el.isVisible().catch(() => false))) continue;
    let label = `#${i}`;
    try { label = ((await el.innerText({ timeout: 600 })).trim() || (await el.getAttribute("aria-label")) || `#${i}`).slice(0, 40); } catch { /* keep */ }
    // Skip the create button here — handled explicitly below.
    if (/new requisition|raise|new opening|create/i.test(label)) continue;
    const s = snap();
    try { await el.click({ timeout: 2500 }); await page.waitForTimeout(400); } catch (e) { findings.push({ stage: "list-controls", el: label, issue: "click failed", detail: e instanceof Error ? e.message.split("\n")[0] : String(e) }); }
    diff("list-controls", label, s);
    await page.keyboard.press("Escape").catch(() => {});
  }

  // ---- 3. Open the create form ----
  let formOpened = false;
  const formFields: string[] = [];
  const createBtn = page.locator('main button', { hasText: /new requisition|raise|new opening|create/i }).first();
  if (await createBtn.count()) {
    const s = snap();
    await createBtn.click({ timeout: 3000 }).catch((e) => findings.push({ stage: "open-form", el: "New Requisition", issue: "click failed", detail: String(e).split("\n")[0] }));
    await page.waitForTimeout(800);
    const dialog = page.locator('.z-\\[60\\]').first();
    formOpened = await dialog.isVisible().catch(() => false);
    diff("open-form", "New Requisition", s);

    if (formOpened) {
      // Inventory the form controls.
      const fields = dialog.locator("input, select, textarea");
      const fc = await fields.count();
      for (let i = 0; i < fc; i++) {
        const f = fields.nth(i);
        const name = (await f.getAttribute("name")) || (await f.getAttribute("placeholder")) || (await f.getAttribute("aria-label")) || (await f.evaluate((n) => n.tagName.toLowerCase()));
        formFields.push(String(name).slice(0, 40));
      }

      // ---- 4. EMPTY submit (validation should block; JS/API errors = bug) ----
      const submit = dialog.locator("button", { hasText: /save|create|submit|raise|add/i }).last();
      if (await submit.count()) {
        const s2 = snap();
        await submit.click({ timeout: 2500 }).catch(() => {});
        await page.waitForTimeout(700);
        diff("empty-submit", "Save/Create", s2);
        const stillOpen = await dialog.isVisible().catch(() => false);
        findings.push({ stage: "empty-submit", el: "Save/Create", issue: stillOpen ? "info: form stayed open (validation likely blocked)" : "WARN: form closed on empty submit (no validation?)", detail: `dialogVisible=${stillOpen}` });
      }

      // ---- 5. FILL + submit ----
      const s3 = snap();
      const inputs = dialog.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([disabled])');
      const ic = await inputs.count();
      for (let i = 0; i < ic; i++) {
        const inp = inputs.nth(i);
        const type = (await inp.getAttribute("type")) || "text";
        try {
          if (type === "number") await inp.fill("2", { timeout: 800 });
          else if (type === "date") await inp.fill("2026-12-31", { timeout: 800 });
          else await inp.fill("QA Test " + i, { timeout: 800 });
        } catch { /* some inputs are combobox displays; skip */ }
      }
      const selects = dialog.locator("select:not([disabled])");
      const sc = await selects.count();
      for (let i = 0; i < sc; i++) {
        try { await selects.nth(i).selectOption({ index: 1 }, { timeout: 800 }); } catch { /* ignore */ }
      }
      const ta = dialog.locator("textarea:not([disabled])");
      const tc = await ta.count();
      for (let i = 0; i < tc; i++) { try { await ta.nth(i).fill("Automated QA test entry.", { timeout: 800 }); } catch { /* ignore */ } }

      const submit2 = dialog.locator("button", { hasText: /save|create|submit|raise|add/i }).last();
      if (await submit2.count()) {
        await submit2.click({ timeout: 2500 }).catch(() => {});
        await page.waitForTimeout(1500);
      }
      diff("filled-submit", "Save/Create (filled)", s3);
      const stillOpen2 = await dialog.isVisible().catch(() => false);
      findings.push({ stage: "filled-submit", el: "Save/Create (filled)", issue: stillOpen2 ? "form still open after filled submit (check for blocking validation/API error above)" : "info: form closed (likely saved OK)", detail: `dialogVisible=${stillOpen2}` });
    }
  } else {
    findings.push({ stage: "open-form", el: "-", issue: "no create button found", detail: "Could not locate a New Requisition / Raise / Create button in main." });
  }

  const report = { page: "/recruit/requisitions", loadStatus, bodyPreview, loadErrors, listClickables: listCount, formOpened, formFields, findings };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\n===RECRUIT_REQ_REPORT_START===\n" + JSON.stringify(report, null, 2) + "\n===RECRUIT_REQ_REPORT_END===\n");
});
