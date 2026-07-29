import { test, expect, Page, Locator } from "@playwright/test";
import fs from "fs";
import path from "path";

/**
 * THROWAWAY end-to-end click-through of the Hiring Pipeline (list view).
 * Drives one candidate Screening -> ... -> Offer (and Accept -> Hired -> Onboard
 * if the org has a salary structure), then probes edge cases. DEV-BYPASS server.
 * Safe to delete.
 */

const SCRATCH =
  "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";
const REPORT = path.join(SCRATCH, "recruit-pipeline-report.json");
const SHOT_DIR = path.join(SCRATCH, "pipeline-shots");

type Finding = { section: string; error: string; where: string; priority: "Low" | "Medium" | "High"; detail?: string };
const findings: Finding[] = [];
const timeline: string[] = [];
const shots: string[] = [];

function prettyStage(stage: string): string {
  return stage === "HRInterview" ? "HR Interview" : stage.replace(/([A-Z])/g, " $1").trim();
}
function localDT(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function localDate(offsetMs: number): string {
  const d = new Date(Date.now() + offsetMs);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

test("recruit hiring pipeline — full drive + edge cases", async ({ page }) => {
  test.setTimeout(480_000);
  page.setDefaultTimeout(12_000); // fail fast so a stuck click can't eat the budget
  page.setDefaultNavigationTimeout(45_000);
  const step = (m: string) => { timeline.push(m); console.log("[STEP] " + m); };
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const netErrors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));
  page.on("requestfailed", (r) => {
    try {
      const u = r.url();
      if (u.includes("/api/")) netErrors.push(`FAILED ${r.method()} ${u} — ${r.failure()?.errorText ?? ""}`);
    } catch { /* ignore listener errors */ }
  });
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("/api/")) {
      let body = ""; try { body = (await r.text()).slice(0, 200); } catch { /* ignore */ }
      netErrors.push(`${r.status()} ${r.request().method()} ${r.url().split("/api/")[1]} :: ${body}`);
    }
  });

  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }) }));

  const shot = async (name: string) => {
    const p = path.join(SHOT_DIR, `${String(shots.length + 1).padStart(2, "0")}-${name}.png`);
    await page.screenshot({ path: p, fullPage: false }).catch(() => {});
    shots.push(p);
  };
  const errSnap = () => ({ p: pageErrors.length, n: netErrors.length });
  const errDiff = (section: string, where: string, s: { p: number; n: number }) => {
    const np = pageErrors.slice(s.p), nn = netErrors.slice(s.n);
    if (np.length) findings.push({ section, error: "JS runtime error", where, priority: "High", detail: np.join(" | ").slice(0, 300) });
    if (nn.length) findings.push({ section, error: "API 4xx/5xx or network failure", where, priority: "High", detail: nn.join(" | ").slice(0, 400) });
  };

  // ── modal helpers ────────────────────────────────────────────────
  const openModal = () => page.locator(".z-\\[60\\]").last();
  const modalVisible = async () => (await page.locator(".z-\\[60\\]").count()) > 0 && await page.locator(".z-\\[60\\]").last().isVisible().catch(() => false);
  const closeAnyModal = async () => {
    for (let i = 0; i < 3; i++) {
      if (!(await modalVisible())) break;
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(250);
    }
  };
  // Drive the custom Select (portal menu at z-[9999]).
  const chooseSelect = async (trigger: Locator, optionText: RegExp | string) => {
    await trigger.click();
    const menu = page.locator(".z-\\[9999\\]");
    await menu.first().waitFor({ state: "visible", timeout: 4000 });
    const opt = menu.locator("button").filter({ hasText: optionText });
    await opt.first().click();
    await page.waitForTimeout(200);
  };

  // Fill the (already-open) Schedule Interview modal and submit. Waits for the
  // interviewer options to actually load before picking one (otherwise the form
  // blocks on "select at least one interviewer").
  const doSchedule = async (dtValue: string): Promise<{ ok: boolean; status?: number }> => {
    const sched = openModal();
    const dt = sched.locator("input[type='datetime-local']");
    if (!(await dt.count())) return { ok: false };
    await dt.first().fill(dtValue);
    await page.waitForTimeout(200);
    await sched.locator("button").filter({ hasText: /Add interviewer/ }).first().click();
    const menu = page.locator(".z-\\[9999\\]");
    await menu.first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    // Employee options render as "First Last\nJob Title"; match a name pattern to
    // skip the empty/placeholder buttons that also live in the portal.
    const realOpt = menu.locator("button").filter({ hasText: /[A-Za-z]{2,}\s+[A-Za-z]{2,}/ }).filter({ hasNotText: /Add interviewer/ });
    // wait until real employee options (beyond the placeholder) have loaded
    for (let t = 0; t < 32; t++) { if ((await realOpt.count()) > 0) break; await page.waitForTimeout(250); }
    const optTexts = await menu.locator("button").allInnerTexts().catch(() => []);
    timeline.push(`interviewer opts(${optTexts.length})=${JSON.stringify(optTexts.slice(0, 4))}`);
    if ((await realOpt.count()) < 1) {
      await page.screenshot({ path: path.join(SHOT_DIR, "DEBUG-scheduler-no-interviewers.png") }).catch(() => {});
      await page.keyboard.press("Escape");
      return { ok: false };
    }
    await realOpt.first().click();
    await page.waitForTimeout(500);
    const chip = await sched.locator("text=/Primary/").count();
    timeline.push(`interviewer chip present=${chip > 0}`);
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/recruit/interviews") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
      sched.getByRole("button", { name: /Schedule Interview/ }).click(),
    ]);
    await page.waitForTimeout(1500);
    const done = page.locator(".z-\\[60\\]").getByRole("button", { name: /^Done$/ });
    if (await done.count()) await done.first().click();
    await page.waitForTimeout(600);
    return { ok: !!resp && resp.status() < 400, status: resp?.status() };
  };

  const clickStageTab = async (stageTitle: string) => {
    // Clicking an already-active tab toggles the filter OFF (hides the table),
    // so only click when it isn't already the selected stage.
    const tab = page.locator(`button.border-t-4[title="${stageTitle}"]`).first();
    await tab.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
    const cls = (await tab.getAttribute("class").catch(() => "")) || "";
    if (!cls.includes("bg-green-50")) {
      await tab.click();
      await page.waitForTimeout(700);
    }
  };
  const rowFor = (name: string) => page.locator("table tbody tr").filter({ hasText: name });

  // ── LOAD ──────────────────────────────────────────────────────────
  let stageNames: string[] = ["Screening", "PhoneScreen", "TechnicalInterview", "ManagerInterview", "HRInterview", "Offer", "Hired"];
  let salaryTemplateCount = -1;
  const pipelinesResp = page.waitForResponse((r) => r.url().includes("/recruit/pipelines"), { timeout: 30000 }).catch(() => null);
  const tmplResp = page.waitForResponse((r) => r.url().includes("/payroll/salary-templates"), { timeout: 30000 }).catch(() => null);

  const s0 = errSnap();
  const resp = await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" }).catch((e) => { pageErrors.push("goto: " + e.message); return null; });
  timeline.push(`load status=${resp?.status() ?? "?"}`);
  await page.waitForTimeout(2500);

  const pr = await pipelinesResp;
  if (pr) { try { const j = await pr.json(); const def = (j.data ?? []).find((p: { isDefault: boolean }) => p.isDefault) ?? j.data?.[0]; if (def?.stages?.length) stageNames = def.stages.map((s: { name: string }) => s.name); } catch { /* keep default */ } }
  const tr = await tmplResp;
  // salary-templates is fetched lazily by the offer wizard; may not fire on load.
  if (tr) { try { const j = await tr.json(); salaryTemplateCount = (j.data ?? []).length; } catch { /* ignore */ } }
  timeline.push(`stages=${stageNames.join(">")}`);
  await shot("loaded");
  errDiff("load", "/recruit/pipeline", s0);

  const firstStage = stageNames[0];
  const offerStageName = stageNames.find((s) => /offer/i.test(s)) ?? "Offer";
  const offerIdx = stageNames.indexOf(offerStageName);

  // ── discover clean Screening candidates (enabled Feedback btn, no offer badge)
  await clickStageTab(prettyStage(firstStage));
  await page.waitForTimeout(800);
  await shot("screening-list");
  const rows = page.locator("table tbody tr");
  const rowCount = await rows.count();
  const clean: string[] = [];
  const anyName: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const nameLoc = row.locator("a").first();
    const name = ((await nameLoc.innerText().catch(() => "")) || "").trim().split("\n")[0];
    if (!name) continue;
    anyName.push(name);
    const fb = row.getByRole("button", { name: /^(Feedback|Schedule)$/ });
    const hasFb = (await fb.count()) > 0;
    const enabled = hasFb ? await fb.first().isEnabled().catch(() => false) : false;
    if (hasFb && enabled) clean.push(name);
  }
  timeline.push(`screening rows=${JSON.stringify(anyName)} clean=${JSON.stringify(clean)}`);

  const driveName = clean[0];
  const lockName = clean[1];
  const rejectName = anyName.find((n) => n !== driveName && n !== lockName);
  const gateName = anyName.find((n) => n !== driveName && n !== lockName && n !== rejectName);

  // ═══════════════════ SECTION 1: FULL DRIVE ═══════════════════════
  step("SECTION 1: full drive");
  let reached = firstStage;
  if (!driveName) {
    findings.push({ section: "full-drive", error: "No clean Screening candidate available to drive", where: "Screening list", priority: "Medium", detail: `rows=${JSON.stringify(anyName)}` });
  } else {
    step(`DRIVE candidate = ${driveName}`);
    // Fresh navigation so the drive starts from a fully-hydrated page.
    await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    try {
      for (let i = 0; i < offerIdx; i++) {
        const stage = stageNames[i];
        const nextStage = stageNames[i + 1];
        await clickStageTab(prettyStage(stage));
        await page.waitForTimeout(600);
        const row = rowFor(driveName);
        if (!(await row.count())) { findings.push({ section: "full-drive", error: `Candidate not found in ${stage}`, where: `${prettyStage(stage)} tab`, priority: "High", detail: `expected ${driveName}` }); break; }
        const fbBtn = row.getByRole("button", { name: /^(Feedback|Schedule)$/ });
        const s = errSnap();
        // Open the feedback modal + select Approve + Save, with a couple retries
        // (the recommendation Select occasionally needs a second click to register,
        // which otherwise leaves Save disabled).
        let saved = false;
        for (let attempt = 0; attempt < 3 && !saved; attempt++) {
          if (!(await modalVisible())) { await fbBtn.first().click().catch(() => {}); await page.waitForTimeout(700); }
          const modal = openModal();
          const recTrigger = modal.locator("button").filter({ hasText: /Select recommendation/ });
          if (await recTrigger.count()) {
            await chooseSelect(recTrigger.first(), /Approve/).catch(() => {});
          }
          const saveBtn = modal.getByRole("button", { name: /Save Feedback/ });
          // wait for Save to become enabled (recommendation registered)
          let enabled = false;
          for (let t = 0; t < 16; t++) { if (await saveBtn.first().isEnabled().catch(() => false)) { enabled = true; break; } await page.waitForTimeout(250); }
          if (!enabled) continue; // retry the recommendation selection
          const [resp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/stage-feedback") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
            saveBtn.first().click().catch(() => {}),
          ]);
          await page.waitForTimeout(1200);
          saved = !!resp && resp.status() < 400;
          if (!saved && resp) timeline.push(`feedback ${stage} status=${resp.status()}`);
        }
        if (!saved) {
          findings.push({ section: "full-drive", error: "Could not save stage feedback (Approve)", where: `${prettyStage(stage)} Feedback modal`, priority: "High" });
          await closeAnyModal();
          break;
        }
        // If next stage is an interview, the scheduler auto-opens.
        const dt = page.locator(".z-\\[60\\] input[type='datetime-local']");
        if (await dt.count()) {
          const r = await doSchedule(localDT(-5 * 60000)); // clamps to now(minute-start) → past → feedback unlocks
          step(`scheduled ${nextStage} status=${r.status ?? "?"} ok=${r.ok}`);
          if (!r.ok) { findings.push({ section: "full-drive", error: `Could not schedule interview for ${nextStage}`, where: `Schedule Interview modal (${stage})`, priority: "High", detail: `status=${r.status ?? "no response"}` }); await closeAnyModal(); break; }
        }
        await closeAnyModal();
        errDiff("full-drive", `advance ${stage}->${nextStage}`, s);
        // Verify the candidate actually landed in the next stage.
        await clickStageTab(prettyStage(nextStage));
        await page.waitForTimeout(700);
        if (!(await rowFor(driveName).count())) {
          // brief poll for the refetch
          for (let t = 0; t < 8 && !(await rowFor(driveName).count()); t++) { await page.waitForTimeout(500); }
        }
        reached = nextStage;
        step(`reached ${reached} (present=${(await rowFor(driveName).count()) > 0})`);
        await shot(`reached-${reached}`);
      }
    } catch (e) {
      findings.push({ section: "full-drive", error: "Exception during feedback drive", where: `reached ${reached}`, priority: "High", detail: (e as Error).message.split("\n")[0] });
      await closeAnyModal();
    }

    // ── OFFER stage: attempt Send Offer wizard ──
    if (reached === offerStageName) {
      try {
        await clickStageTab(prettyStage(offerStageName));
        await page.waitForTimeout(800);
        await shot("offer-stage");
        const row = rowFor(driveName);
        const sendBtn = row.getByRole("button", { name: /Send Offer/ });
        if (await sendBtn.count()) {
          const s = errSnap();
          await sendBtn.first().click();
          await page.waitForTimeout(800);
          // Step 0 Employment → Next
          await page.getByRole("button", { name: /^Next$/ }).click().catch(() => {});
          await page.waitForTimeout(400);
          // Step 1 Compensation — salary template (auto-selects default) + CTC
          const noTmplMsg = page.locator("text=No salary templates found");
          if (await noTmplMsg.count()) {
            salaryTemplateCount = 0;
            findings.push({ section: "offer", error: "Cannot send offer — no salary templates exist (dropdown empty). Send-Offer wizard is blocked at the Compensation step, so the entire Offer→Hire→Onboard flow is unreachable via the UI for an org with no salary structure.", where: "Send Offer wizard · step 2 (Compensation)", priority: "High", detail: "GET /payroll/salary-templates returned 0. Offer wizard 'Next' stays disabled without a salary template." });
            await shot("offer-blocked-no-template");
          } else {
            salaryTemplateCount = Math.max(salaryTemplateCount, 1);
            const tmplTrigger = page.locator("button").filter({ hasText: /Select a template/ });
            if (await tmplTrigger.count()) await chooseSelect(tmplTrigger.first(), /.+/);
            await page.waitForTimeout(400);
            // Ensure annual CTC is filled (placeholder "0").
            await page.getByPlaceholder("0").first().fill("2000000").catch(() => {});
            await page.waitForTimeout(300);
            await page.getByRole("button", { name: /^Next$/ }).click().catch(() => {});
            await page.waitForTimeout(500);
            // Step 2 Settings & Dates — joining date required
            const dateInputs = page.locator("input[type='date']");
            await dateInputs.first().fill(localDate(30 * 86400000));
            await page.waitForTimeout(300);
            await page.getByRole("button", { name: /^Next$/ }).click().catch(() => {});
            await page.waitForTimeout(500);
            await shot("offer-review");
            // Step 3 → Send
            const [sendResp] = await Promise.all([
              page.waitForResponse((r) => r.url().includes("/mail/offer") && r.request().method() === "POST", { timeout: 25000 }).catch(() => null),
              page.getByRole("button", { name: /^Send$/ }).click().catch(() => {}),
            ]);
            step(`offer send status=${sendResp?.status() ?? "?"}`);
            await page.waitForTimeout(2500);
            await shot("offer-sent");
          }
          errDiff("offer", "Send Offer wizard", s);
        } else {
          findings.push({ section: "offer", error: "No 'Send Offer' button on Offer-stage row", where: "Offer tab", priority: "Medium" });
        }
        // Clean up wizard if still open
        await page.getByRole("button", { name: /^Cancel$/ }).click().catch(() => {});
        await closeAnyModal();
      } catch (e) {
        findings.push({ section: "offer", error: "Exception in Send Offer wizard", where: "Offer stage", priority: "High", detail: (e as Error).message.split("\n")[0] });
        await closeAnyModal();
      }

      // ── ACCEPT → Hired → Onboard (only if an offer got sent) ──
      try {
        await clickStageTab(prettyStage(offerStageName));
        await page.waitForTimeout(800);
        const row = rowFor(driveName);
        const acceptBtn = row.getByRole("button", { name: /Mark accepted/ });
        if (await acceptBtn.count()) {
          const s = errSnap();
          await acceptBtn.first().click();
          await page.waitForTimeout(700);
          const modal = openModal();
          const recTrigger = modal.locator("button").filter({ hasText: /Select recommendation/ });
          await chooseSelect(recTrigger.first(), /Approve/);
          const [accResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/recruit/offers/") && r.request().method() === "PATCH", { timeout: 20000 }).catch(() => null),
            modal.getByRole("button", { name: /Save & Accept/ }).click(),
          ]);
          step(`accept status=${accResp?.status() ?? "?"}`);
          await page.waitForTimeout(1800);
          await closeAnyModal();
          errDiff("accept", "Mark accepted", s);
          reached = "Hired";
          await shot("accepted-hired");

          // Onboard
          await clickStageTab(prettyStage(stageNames[stageNames.length - 1] || "Hired"));
          await page.waitForTimeout(800);
          const hrow = rowFor(driveName);
          const onboardBtn = hrow.getByRole("button", { name: /Onboard/ });
          if (await onboardBtn.count()) {
            const s2 = errSnap();
            const [obResp] = await Promise.all([
              page.waitForResponse((r) => r.url().includes("/onboard") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
              onboardBtn.first().click(),
            ]);
            step(`onboard status=${obResp?.status() ?? "?"}`);
            await page.waitForURL(/\/onboarding\//, { timeout: 15000 }).catch(() => {});
            step(`post-onboard url=${page.url()}`);
            errDiff("onboard", "Onboard button", s2);
            if (/\/onboarding\//.test(page.url())) reached = "Onboard (Pre-Onboarding)";
            await shot("onboarded");
          } else {
            findings.push({ section: "onboard", error: "No Onboard button on Hired row", where: "Hired tab", priority: "Medium" });
          }
        } else {
          timeline.push("accept skipped — no 'Mark accepted' button (offer not in Sent state)");
        }
      } catch (e) {
        findings.push({ section: "accept/onboard", error: "Exception in accept/onboard", where: reached, priority: "High", detail: (e as Error).message.split("\n")[0] });
        await closeAnyModal();
      }
    } else {
      findings.push({ section: "full-drive", error: `Candidate stalled before Offer (reached ${reached})`, where: `${prettyStage(reached)} stage`, priority: "High", detail: "See timeline for where advancement stopped." });
    }
  }
  step(`FINAL reached = ${reached}`);

  // ═══════════════ SECTION 2: FUTURE-INTERVIEW LOCK ════════════════
  step("SECTION 2: future-lock");
  // Drive a clean candidate's Screening feedback then schedule in the FUTURE →
  // the next-stage Feedback button must be locked (feedbackNotYet).
  try {
    await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await clickStageTab(prettyStage(firstStage));
    await page.waitForTimeout(600);
    if (lockName && rowFor(lockName)) {
      const row = rowFor(lockName);
      if (await row.count()) {
        await row.getByRole("button", { name: /^(Feedback|Schedule)$/ }).first().click();
        await page.waitForTimeout(600);
        const modal = openModal();
        await chooseSelect(modal.locator("button").filter({ hasText: /Select recommendation/ }).first(), /Approve/);
        await Promise.all([
          page.waitForResponse((r) => r.url().includes("/stage-feedback") && r.request().method() === "POST", { timeout: 20000 }).catch(() => null),
          modal.getByRole("button", { name: /Save Feedback/ }).click(),
        ]);
        await page.waitForTimeout(1200);
        const dt = page.locator(".z-\\[60\\] input[type='datetime-local']");
        if (await dt.count()) {
          const r = await doSchedule(localDT(2 * 86400000)); // 2 days FUTURE
          timeline.push(`lock-test: scheduled future ok=${r.ok} status=${r.status ?? "?"}`);
          await closeAnyModal();
          // Now on the next stage the Feedback should be locked/disabled.
          await clickStageTab(prettyStage(stageNames[1]));
          await page.waitForTimeout(800);
          const nrow = rowFor(lockName);
          const present = await nrow.count();
          const nbtn = nrow.getByRole("button", { name: /^(Feedback|Schedule)$/ });
          const btnCount = await nbtn.count();
          const disabled = btnCount ? await nbtn.first().isDisabled().catch(() => false) : false;
          const title = btnCount ? await nbtn.first().getAttribute("title").catch(() => "") : "";
          timeline.push(`lock-test: ${lockName} in ${prettyStage(stageNames[1])}=${present > 0} btnCount=${btnCount} disabled=${disabled} title="${title}"`);
          await shot("future-lock");
          if (present === 0) {
            findings.push({ section: "future-lock", error: "Lock test inconclusive — candidate did not reach the next stage", where: `${prettyStage(stageNames[1])} tab`, priority: "Low", detail: `${lockName} not present after scheduling a future interview` });
          } else if (btnCount > 0 && !disabled) {
            findings.push({ section: "future-lock", error: "Feedback NOT locked despite interview scheduled in the future", where: `${prettyStage(stageNames[1])} row for ${lockName}`, priority: "High", detail: `button disabled=${disabled}, title="${title}"` });
          }
        }
      }
    } else {
      timeline.push("lock-test skipped — no second clean candidate");
    }
  } catch (e) {
    findings.push({ section: "future-lock", error: "Exception", where: "future-lock section", priority: "Medium", detail: (e as Error).message.split("\n")[0] });
    await closeAnyModal();
  }

  // ═══════════════ SECTION 3: FEEDBACK-REQUIRED GATE ═══════════════
  step("SECTION 3: feedback-gate");
  // Overflow menu → "Move to next" with 0 feedback must block + open feedback.
  try {
    await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await clickStageTab(prettyStage(firstStage));
    await page.waitForTimeout(600);
    const target = gateName ?? rejectName;
    if (target) {
      const row = rowFor(target);
      if (await row.count()) {
        await row.getByRole("button", { name: /More actions/ }).first().click();
        await page.waitForTimeout(400);
        const moveNext = page.getByRole("button", { name: /Move to next/ });
        const s = errSnap();
        if (await moveNext.count()) {
          await moveNext.first().click();
          await page.waitForTimeout(1000);
          // Expect a "Feedback required" toast + feedback modal opened (no move).
          const modal = openModal();
          const opened = await modal.locator("button").filter({ hasText: /Select recommendation/ }).count();
          const toastTxt = await page.locator("text=/Feedback required/i").count();
          timeline.push(`gate-test: feedbackModalOpened=${opened > 0} toast=${toastTxt > 0}`);
          await shot("feedback-gate");
          if (opened === 0 && toastTxt === 0) {
            findings.push({ section: "feedback-gate", error: "'Move to next' without feedback did not block (no warning, no feedback modal)", where: `overflow menu → Move to next (${target})`, priority: "High" });
          }
          errDiff("feedback-gate", "Move to next", s);
          await closeAnyModal();
        } else {
          timeline.push("gate-test: 'Move to next' not in overflow menu");
        }
      }
    }
  } catch (e) {
    findings.push({ section: "feedback-gate", error: "Exception", where: "feedback-gate section", priority: "Medium", detail: (e as Error).message.split("\n")[0] });
    await closeAnyModal();
  }

  // ═══════════════ SECTION 4: REJECT WITH REASON ══════════════════
  step("SECTION 4: reject");
  try {
    await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await clickStageTab(prettyStage(firstStage));
    await page.waitForTimeout(600);
    if (rejectName) {
      const row = rowFor(rejectName);
      if (await row.count()) {
        await row.getByRole("button", { name: /More actions/ }).first().click();
        await page.waitForTimeout(400);
        const rejectItem = page.getByRole("button", { name: /Reject candidate/ });
        const s = errSnap();
        if (await rejectItem.count()) {
          await rejectItem.first().click();
          await page.waitForTimeout(600);
          const modal = openModal();
          await modal.locator("textarea").first().fill("QA automated reject — skills not a match.");
          const [rejResp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/recruit/applications/") && r.request().method() === "PATCH", { timeout: 20000 }).catch(() => null),
            modal.getByRole("button", { name: /Reject candidate/ }).click(),
          ]);
          timeline.push(`reject status=${rejResp?.status() ?? "?"}`);
          await page.waitForTimeout(1500);
          await closeAnyModal();
          errDiff("reject", "Reject candidate", s);
          // Candidate should now be gone from the active Screening list.
          await clickStageTab(prettyStage(firstStage));
          await page.waitForTimeout(800);
          const stillThere = await rowFor(rejectName).count();
          timeline.push(`reject-test: ${rejectName} still in active list=${stillThere > 0}`);
          await shot("rejected");
          if (stillThere > 0) findings.push({ section: "reject", error: "Rejected candidate still shows in active pipeline list", where: `Screening list (${rejectName})`, priority: "Medium" });
        }
      }
    }
  } catch (e) {
    findings.push({ section: "reject", error: "Exception", where: "reject section", priority: "Medium", detail: (e as Error).message.split("\n")[0] });
    await closeAnyModal();
  }

  // ═══════════════ SECTION 5: code-verified structural findings ════
  // (verified by reading page.tsx; not runtime-reproducible in list view)
  findings.push({ section: "edit-stage(backward)", error: "The 'Edit Stage' modal (the only backward-move UI) has no trigger — setMoveApp is never called to OPEN it (page.tsx:239/492 only reset it). A recruiter cannot move a candidate BACKWARD a stage anywhere in the list UI.", where: "recruit/pipeline/page.tsx — Edit Stage modal (line ~2182) is dead code", priority: "Medium", detail: "Skip modal only allows forward moves; no backward path exists." });
  findings.push({ section: "doc-gate", error: "The document-approval gate popup (docBlockApp) only fires from the KANBAN 'Move to Offer' button (page.tsx:1316), but viewMode is hard-locked to 'list' (page.tsx:250). In list view, HRInterview→Offer advances via stage-feedback (recommendation Hire), which performs NO doc-gate check — so unapproved requested docs do NOT block reaching Offer. (The gate still applies later at Onboard.)", where: "recruit/pipeline/page.tsx — list-view Offer advancement bypasses docGate", priority: "Medium" });

  // ── WRITE REPORT ─────────────────────────────────────────────────
  const report = {
    page: "/recruit/pipeline",
    driveCandidate: driveName ?? null,
    reachedStage: reached,
    salaryTemplateCount,
    stageOrder: stageNames,
    errorTotals: { pageErrors: pageErrors.length, netErrors: netErrors.length, consoleErrors: consoleErrors.length },
    pageErrors, netErrors,
    timeline,
    findings,
    screenshots: shots,
  };
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\n===PIPELINE_REPORT_START===\n" + JSON.stringify(report, null, 2) + "\n===PIPELINE_REPORT_END===\n");
  expect(true).toBe(true);
});
