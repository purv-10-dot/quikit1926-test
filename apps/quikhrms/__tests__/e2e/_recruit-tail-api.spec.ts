import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

/** THROWAWAY — verify the pipeline TAIL end-to-end via the same APIs the buttons call. */
const DIR = "C:/Users/User/AppData/Local/Temp/claude/C--Users-User-Desktop-Quikit-Final-08-07-26-quikit1926/a922062f-0ce9-4957-9627-524289a0c614/scratchpad";
const H = { "x-tenant-id": "tenant_dev_001", "x-user-id": "user_dev_001", "x-user-roles": "admin", "x-dev-role": "admin" };
const R = "/api/v1/hrms/recruit";

test("pipeline tail via API — accept→hired→onboard→pre-onboarding + decline", async ({ request }) => {
  test.setTimeout(120_000);
  const report: Record<string, unknown> = {};
  const g = async (url: string) => { const r = await request.get(url, { headers: H }); return { status: r.status(), data: (await r.json().catch(() => ({})))?.data ?? [] }; };

  const active = await g(`${R}/applications?status=AppActive&limit=50`);
  report.appActiveCount = active.data.length;
  const appA = active.data[0]; const appB = active.data[1];
  if (!appA) { report.fatal = "No AppActive candidate left (re-seed needed)."; fin(report); return; }

  const nm = (a: { candidate: { firstName: string; lastName: string } }) => `${a.candidate.firstName} ${a.candidate.lastName}`;

  // ACCEPT path
  const mvA = await request.patch(`${R}/applications/${appA.id}`, { headers: H, data: { currentStage: "Offer" } });
  const afterMove = await g(`${R}/applications?status=AppActive,AppOffered,AppOnHold&limit=50`);
  const aRow = afterMove.data.find((x: { id: string }) => x.id === appA.id);
  const sf = await request.post(`${R}/applications/${appA.id}/stage-feedback`, { headers: H, data: { overallRating: 8, recommendation: "Hire", overallComments: "QA accept" } });
  const offAcc = await request.patch(`${R}/offers/${appA.id}`, { headers: H, data: { status: "OfferAccepted" } });
  const hired = await g(`${R}/applications?status=AppHired&limit=50`);
  const aHired = hired.data.find((x: { id: string }) => x.id === appA.id);
  const onbRes = await request.post(`${R}/applications/${appA.id}/onboard`, { headers: H, data: {} });
  const onbJson = await onbRes.json().catch(() => ({}));
  const pre = await request.get(`/api/v1/hrms/pre-onboarding/roster?limit=100`, { headers: H });
  const preStr = JSON.stringify(await pre.json().catch(() => ({}))).toLowerCase();

  report.accept = {
    candidate: nm(appA),
    moveToOffer: mvA.status(),
    draftOfferAutoCreated: !!aRow?.latestOffer,
    stageFeedback: sf.status(),
    offerAccept: offAcc.status(),
    becameHired: !!aHired,
    hiredStatus: aHired?.status,
    onboard: onbRes.status(),
    onboardRedirect: onbJson?.data?.redirectUrl ?? null,
    newEmployeeId: onbJson?.data?.employee?.id ?? null,
    preOnboardingRoster: pre.status(),
    appearsInPreOnboarding: preStr.includes(appA.candidate.firstName.toLowerCase()),
  };

  // DECLINE edge
  if (appB) {
    await request.patch(`${R}/applications/${appB.id}`, { headers: H, data: { currentStage: "Offer" } });
    const sfB = await request.post(`${R}/applications/${appB.id}/stage-feedback`, { headers: H, data: { overallRating: 4, recommendation: "NoHire", overallComments: "QA decline" } });
    const offDec = await request.patch(`${R}/offers/${appB.id}`, { headers: H, data: { status: "OfferDeclined" } });
    const declined = await g(`${R}/applications?status=AppDeclined&limit=50`);
    const bDec = declined.data.find((x: { id: string }) => x.id === appB.id);
    report.decline = { candidate: nm(appB), stageFeedback: sfB.status(), offerDecline: offDec.status(), becameDeclined: !!bDec, status: bDec?.status };
  }

  fin(report);
});

function fin(report: Record<string, unknown>) {
  fs.writeFileSync(path.join(DIR, "tail-api-report.json"), JSON.stringify(report, null, 2));
  console.log("\n===TAILAPI_START===\n" + JSON.stringify(report, null, 2) + "\n===TAILAPI_END===\n");
}
