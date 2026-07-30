import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/** THROWAWAY — Hiring Pipeline TAIL: Offer → Accept → Hired → Onboard → Pre-Onboarding (+ Decline edge). */
const DIR = "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";
const H = { "x-tenant-id": "tenant_dev_001", "x-user-id": "user_dev_001", "x-user-roles": "admin", "x-dev-role": "admin" };
const shot = (p: string) => path.join(DIR, "tail-" + p);

test("recruit pipeline tail — accept→hired→onboard + decline", async ({ page }) => {
  test.setTimeout(240_000);
  const errs: string[] = [];
  const report: Record<string, unknown> = { steps: [] as string[] };
  const log = (m: string) => (report.steps as string[]).push(m);

  const writeReport = () => {
    report.errorsCaptured = errs;
    fs.writeFileSync(path.join(DIR, "tail-report.json"), JSON.stringify(report, null, 2));
    console.log("\n===TAIL_START===\n" + JSON.stringify(report, null, 2) + "\n===TAIL_END===\n");
  };

  page.on("pageerror", (e) => errs.push("JS: " + e.message));
  page.on("response", async (r) => {
    if (r.status() >= 400 && r.url().includes("/api/") && !r.url().includes("/api/auth/")) {
      let b = ""; try { b = (await r.text()).slice(0, 160); } catch { /* ignore */ }
      errs.push(`${r.status()} ${r.request().method()} ${r.url().split("/api/")[1]} :: ${b}`);
    }
  });

  await page.addInitScript(() => { try { window.localStorage.setItem("hrms.roles", "admin"); } catch { /* ignore */ } });
  await page.route("**/api/v1/hrms/setup/status", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { setupCompleted: true, coreCompleted: true, completedCount: 9, totalCount: 9, items: [] } }) }));

  // Need a page/origin before page.request uses the baseURL cookie jar; go to app first.
  await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });

  // ---- SETUP via API: put 2 AppActive candidates into the Offer stage (auto-creates draft offer) ----
  const base = "http://localhost:3019/api/v1/hrms/recruit";
  const listRes = await page.request.get(`${base}/applications?status=AppActive&limit=50`, { headers: H });
  const listJson = await listRes.json().catch(() => ({}));
  const apps: Array<{ id: string; candidate: { firstName: string; lastName: string }; currentStage: string; status: string }> = listJson?.data ?? [];
  log(`GET applications status=${listRes.status()} count=${apps.length}`);
  report.sampleStages = apps.slice(0, 6).map((a) => `${a.candidate?.firstName} ${a.candidate?.lastName}:${a.currentStage}/${a.status}`);
  const appA = apps[0]; const appB = apps[1];
  if (!appA) { report.fatal = "No AppActive candidate to drive."; fs.writeFileSync(path.join(DIR, "tail-report.json"), JSON.stringify(report, null, 2)); console.log("\n===TAIL_START===\n" + JSON.stringify(report, null, 2) + "\n===TAIL_END===\n"); return; }

  for (const a of [appA, appB].filter(Boolean)) {
    const pr = await page.request.patch(`${base}/applications/${a.id}`, { headers: H, data: { currentStage: "Offer" } });
    log(`PATCH ${a.candidate.firstName}->Offer status=${pr.status()}`);
  }
  // Confirm draft offer auto-created
  const chkRes = await page.request.get(`${base}/applications?status=AppActive,AppOffered,AppOnHold&limit=50`, { headers: H });
  const chk: Array<{ id: string; currentStage: string; latestOffer: unknown }> = (await chkRes.json().catch(() => ({})))?.data ?? [];
  const aRow = chk.find((x) => x.id === appA.id);
  report.appA = { name: `${appA.candidate.firstName} ${appA.candidate.lastName}`, stageAfter: aRow?.currentStage, draftOfferCreated: !!aRow?.latestOffer };
  log(`appA stage=${aRow?.currentStage} draftOffer=${!!aRow?.latestOffer}`);

  const nameA = `${appA.candidate.firstName} ${appA.candidate.lastName}`;
  const nameB = appB ? `${appB.candidate.firstName} ${appB.candidate.lastName}` : null;

  // ---- UI: open Offer stage ----
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.locator('button[title="Offer"]').first().click({ timeout: 5000 }).catch((e) => log("click Offer tab FAIL " + String(e).split("\n")[0]));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot("01-offer-stage.png"), fullPage: true });

  // ---- ACCEPT appA ----
  const rowA = page.locator("tr", { hasText: nameA }).first();
  const acceptBtn = rowA.locator('button[title*="accepted" i]').first();
  const sendOfferBtn = rowA.locator('button', { hasText: /send offer/i }).first();
  const accept: Record<string, unknown> = { rowFound: await rowA.count(), acceptBtn: await acceptBtn.count(), sendOfferInstead: await sendOfferBtn.count() };
  if (await acceptBtn.count()) {
    const urlBefore = page.url();
    await acceptBtn.click({ timeout: 4000 }).catch((e) => (accept.clickErr = String(e).split("\n")[0]));
    await page.waitForTimeout(800);
    accept.navigatedAway = page.url() !== urlBefore && !page.url().includes("/recruit/pipeline");
    const modal = page.locator('.z-\\[60\\]').first();
    accept.modalOpened = await modal.isVisible().catch(() => false);
    if (accept.modalOpened) {
      // recommendation select + comment textarea inside the Stage Feedback modal
      const sel = modal.locator("select").first();
      if (await sel.count()) await sel.selectOption({ index: 1 }).catch(() => {});
      const ta = modal.locator("textarea").first();
      if (await ta.count()) await ta.fill("QA: candidate accepted verbally.").catch(() => {});
      await page.screenshot({ path: shot("02-accept-modal.png") });
      const save = modal.locator("button", { hasText: /accept/i }).last();
      await save.click({ timeout: 4000 }).catch((e) => (accept.saveErr = String(e).split("\n")[0]));
      await page.waitForTimeout(2000);
      accept.modalClosed = !(await modal.isVisible().catch(() => true));
    }
  }
  // verify via API
  const afterAccept = await (await page.request.get(`${base}/applications?status=AppActive,AppOffered,AppOnHold,AppHired&limit=50`, { headers: H })).json().catch(() => ({}));
  const aAfter = (afterAccept?.data ?? []).find((x: { id: string }) => x.id === appA.id);
  accept.appAStatusAfter = aAfter?.status; accept.appAStageAfter = aAfter?.currentStage;
  report.accept = accept;
  log(`after-accept appA status=${aAfter?.status} stage=${aAfter?.currentStage}`);

  // ---- ONBOARD appA (from Hired) ----
  const onboard: Record<string, unknown> = {};
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  await page.locator('button[title="Hired"]').first().click({ timeout: 5000 }).catch((e) => log("click Hired tab FAIL " + String(e).split("\n")[0]));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: shot("03-hired-stage.png"), fullPage: true });
  const rowH = page.locator("tr", { hasText: nameA }).first();
  const onboardBtn = rowH.locator("button", { hasText: /onboard/i }).first();
  onboard.buttonFound = await onboardBtn.count();
  if (await onboardBtn.count()) {
    await onboardBtn.click({ timeout: 4000 }).catch((e) => (onboard.clickErr = String(e).split("\n")[0]));
    await page.waitForTimeout(2500);
    onboard.urlAfter = page.url();
    onboard.redirectedToOnboarding = /onboarding|pre-onboarding/i.test(page.url());
    await page.screenshot({ path: shot("04-after-onboard.png"), fullPage: true });
  }
  report.onboard = onboard;
  log(`onboard btn=${onboard.buttonFound} url=${onboard.urlAfter}`);

  // ---- VERIFY Pre-Onboarding roster ----
  const preRes = await page.request.get("http://localhost:3019/api/v1/hrms/pre-onboarding/roster?limit=100", { headers: H });
  const preJson = await preRes.json().catch(() => ({}));
  const preList = JSON.stringify(preJson).toLowerCase();
  report.preOnboarding = {
    rosterStatus: preRes.status(),
    candidateAppears: preList.includes(appA.candidate.firstName.toLowerCase()),
  };
  await page.goto("/pre-onboarding", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: shot("05-pre-onboarding.png"), fullPage: true });
  log(`preOnboarding roster=${preRes.status()} appears=${report.preOnboarding && (report.preOnboarding as Record<string, unknown>).candidateAppears}`);

  // ---- EDGE: DECLINE appB ----
  const decline: Record<string, unknown> = { name: nameB };
  if (nameB) {
    await page.goto("/recruit/pipeline", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await page.locator('button[title="Offer"]').first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1000);
    const rowB = page.locator("tr", { hasText: nameB }).first();
    const declineBtn = rowB.locator('button[title*="declined" i]').first();
    decline.rowFound = await rowB.count(); decline.declineBtn = await declineBtn.count();
    if (await declineBtn.count()) {
      await declineBtn.click({ timeout: 4000 }).catch((e) => (decline.clickErr = String(e).split("\n")[0]));
      await page.waitForTimeout(700);
      const modal = page.locator('.z-\\[60\\]').first();
      decline.modalOpened = await modal.isVisible().catch(() => false);
      if (decline.modalOpened) {
        const sel = modal.locator("select").first();
        if (await sel.count()) await sel.selectOption({ index: 1 }).catch(() => {});
        const ta = modal.locator("textarea").first();
        if (await ta.count()) await ta.fill("QA: candidate declined.").catch(() => {});
        await page.screenshot({ path: shot("06-decline-modal.png") });
        const save = modal.locator("button", { hasText: /decline/i }).last();
        await save.click({ timeout: 4000 }).catch((e) => (decline.saveErr = String(e).split("\n")[0]));
        await page.waitForTimeout(1800);
      }
      const afterDecline = await (await page.request.get(`${base}/applications?status=AppActive,AppOffered,AppOnHold,AppDeclined&limit=50`, { headers: H })).json().catch(() => ({}));
      const bAfter = (afterDecline?.data ?? []).find((x: { id: string }) => x.id === appB.id);
      decline.appBStatusAfter = bAfter?.status;
    }
  }
  report.decline = decline;

  report.errorsCaptured = errs;
  fs.writeFileSync(path.join(DIR, "tail-report.json"), JSON.stringify(report, null, 2));
  console.log("\n===TAIL_START===\n" + JSON.stringify(report, null, 2) + "\n===TAIL_END===\n");
});
