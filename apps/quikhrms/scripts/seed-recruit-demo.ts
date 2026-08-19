/**
 * Dummy data for the entire Recruit module:
 *   • Requisitions            → JobRequisition rows (Open / Pending / Draft / Closed)
 *   • Candidates              → Candidate rows (varied source / status / experience)
 *   • Pipeline                → HiringPipeline + JobApplications spread across stages
 *   • Interviews              → Interview rows (scheduled + completed w/ scorecards)
 *   • Candidate Document Types → CandidateDocumentType rows
 *
 * Idempotent: requisitions (by number), candidates (by email), applications
 * (by candidate+req) and doc types (by code) are upserted; demo
 * interviews are wiped for the demo applications before reinsert.
 *
 * Run:  npm run seed:recruit
 *   or  tsx --env-file=.env.local scripts/seed-recruit-demo.ts
 */

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const ME_EMAIL = "gourav.chandel";
const DEFAULT_STAGES = [
  { name: "Screening", sendMail: false, mailTemplate: null },
  { name: "PhoneScreen", sendMail: false, mailTemplate: "interview" },
  { name: "TechnicalInterview", sendMail: false, mailTemplate: "interview" },
  { name: "ManagerInterview", sendMail: false, mailTemplate: "interview" },
  { name: "HRInterview", sendMail: false, mailTemplate: "interview" },
  { name: "Offer", sendMail: false, mailTemplate: "offer-branded" },
  { name: "Hired", sendMail: false, mailTemplate: "welcome" },
];

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

async function main() {
  // ── Resolve org + demo people ──────────────────────────────────────────
  const me =
    (await prisma.employee.findFirst({
      where: {
        deletedAt: null,
        OR: [
          { workEmail: { contains: ME_EMAIL, mode: "insensitive" } },
          { personalEmail: { contains: ME_EMAIL, mode: "insensitive" } },
        ],
      },
      select: { id: true, orgId: true, firstName: true },
    })) ??
    (await prisma.employee.findFirst({
      where: { deletedAt: null, status: "Active" },
      orderBy: { employeeCode: "asc" },
      select: { id: true, orgId: true, firstName: true },
    }));
  if (!me) throw new Error("No employees found — seed employees first.");
  const orgId = me.orgId;

  const interviewers = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, status: "Active" },
    take: 4,
    orderBy: { employeeCode: "asc" },
    select: { id: true, firstName: true, lastName: true },
  });
  const interviewerId = (i: number) => interviewers[i % interviewers.length]?.id ?? me.id;
  const dept = await prisma.department.findFirst({ where: { orgId, deletedAt: null }, select: { id: true } });
  console.log(`Org ${orgId} · recruiter = ${me.firstName} · ${interviewers.length} interviewers · dept ${dept?.id ?? "none"}`);

  // ── 1. Pipeline (Pipeline page) ─────────────────────────────────────────
  let pipeline = await prisma.hiringPipeline.findFirst({ where: { orgId, deletedAt: null, isDefault: true }, select: { id: true } });
  if (!pipeline) {
    pipeline = await prisma.hiringPipeline.create({
      data: { orgId, name: "Default Hiring Pipeline", stages: DEFAULT_STAGES, isDefault: true, createdBy: me.id, updatedBy: me.id },
      select: { id: true },
    });
    console.log("Created default pipeline");
  } else {
    console.log("Default pipeline already exists");
  }

  // ── 2. Requisitions (Requisitions page) ─────────────────────────────────
  const REQS = [
    { num: "REQ-DEMO-001", title: "Senior Backend Engineer", status: "ReqOpen" as const, priority: "High" as const, positions: 2, expMin: 4, expMax: 8, salMin: 1800000, salMax: 3000000 },
    { num: "REQ-DEMO-002", title: "Product Designer", status: "ReqOpen" as const, priority: "Medium" as const, positions: 1, expMin: 3, expMax: 6, salMin: 1400000, salMax: 2200000 },
    { num: "REQ-DEMO-003", title: "HR Business Partner", status: "PendingApproval" as const, priority: "Medium" as const, positions: 1, expMin: 5, expMax: 10, salMin: 1600000, salMax: 2600000 },
    { num: "REQ-DEMO-004", title: "DevOps Engineer", status: "ReqDraft" as const, priority: "Low" as const, positions: 1, expMin: 3, expMax: 7, salMin: 1500000, salMax: 2400000 },
    { num: "REQ-DEMO-005", title: "Sales Manager (filled)", status: "ReqClosed" as const, priority: "Urgent" as const, positions: 1, expMin: 6, expMax: 12, salMin: 2000000, salMax: 3500000 },
  ];
  const reqByNum = new Map<string, string>();
  for (const r of REQS) {
    const row = await prisma.jobRequisition.upsert({
      where: { orgId_requisitionNumber: { orgId, requisitionNumber: r.num } },
      update: {
        title: r.title, status: r.status, priority: r.priority, positions: r.positions,
        experienceMin: r.expMin, experienceMax: r.expMax, salaryMin: r.salMin, salaryMax: r.salMax,
        pipelineId: pipeline.id, recruiterId: me.id, hiringManagerId: interviewerId(0), updatedBy: me.id,
      },
      create: {
        orgId, requisitionNumber: r.num, title: r.title, status: r.status, priority: r.priority,
        positions: r.positions, type: "NewPosition", employmentType: "FullTime", workLocation: "Office",
        experienceMin: r.expMin, experienceMax: r.expMax, salaryMin: r.salMin, salaryMax: r.salMax,
        departmentId: dept?.id ?? null, pipelineId: pipeline.id,
        createdById: me.id, recruiterId: me.id, hiringManagerId: interviewerId(0), raisedById: me.id, raisedAt: new Date(),
        jobDescription: `We're hiring a ${r.title}. Own delivery end-to-end and collaborate across teams.`,
        requirements: ["Strong fundamentals", "3+ years relevant experience", "Good communication"],
        createdBy: me.id, updatedBy: me.id,
      },
      select: { id: true, requisitionNumber: true },
    });
    reqByNum.set(row.requisitionNumber, row.id);
  }
  console.log(`Requisitions ready: ${reqByNum.size}`);

  // ── 3. Candidates (Candidates page) ─────────────────────────────────────
  const CANDIDATES = [
    { first: "Aditya", last: "Nair", exp: 6, comp: "Infosys", des: "SDE III", source: "CandLinkedIn" as const, status: "InPipeline" as const, rating: 4.5 },
    { first: "Sneha", last: "Kulkarni", exp: 4, comp: "Zomato", des: "Product Designer", source: "CandReferral" as const, status: "InPipeline" as const, rating: 4.0 },
    { first: "Rohit", last: "Menon", exp: 8, comp: "Amazon", des: "Senior Engineer", source: "CandJobPortal" as const, status: "InPipeline" as const, rating: 3.5 },
    { first: "Fatima", last: "Sheikh", exp: 5, comp: "PhonePe", des: "HRBP", source: "CandInbound" as const, status: "New" as const, rating: null },
    { first: "Karan", last: "Malhotra", exp: 7, comp: "Flipkart", des: "DevOps Lead", source: "CandAgency" as const, status: "New" as const, rating: null },
    { first: "Divya", last: "Reddy", exp: 9, comp: "Freshworks", des: "Sales Manager", source: "CandCareerPage" as const, status: "Hired" as const, rating: 4.8 },
    { first: "Mohit", last: "Verma", exp: 3, comp: "Paytm", des: "Backend Engineer", source: "CandDirect" as const, status: "CandRejected" as const, rating: 2.5 },
  ];
  const candByEmail = new Map<string, string>();
  for (const c of CANDIDATES) {
    const email = `${c.first}.${c.last}@example.com`.toLowerCase();
    const row = await prisma.candidate.upsert({
      where: { orgId_email: { orgId, email } },
      update: {
        firstName: c.first, lastName: c.last, currentCompany: c.comp, currentDesignation: c.des,
        totalExperience: c.exp, source: c.source, status: c.status, rating: c.rating, updatedBy: me.id,
      },
      create: {
        orgId, firstName: c.first, lastName: c.last, email, phone: "+9198" + String(10000000 + Math.floor(c.exp * 111111)),
        currentCompany: c.comp, currentDesignation: c.des, totalExperience: c.exp,
        currentCTC: 1000000 + c.exp * 150000, expectedCTC: 1400000 + c.exp * 200000, noticePeriod: 60,
        skills: ["JavaScript", "SQL", "Communication"], location: "Bengaluru", willingToRelocate: true,
        source: c.source, status: c.status, rating: c.rating, createdBy: me.id, updatedBy: me.id,
      },
      select: { id: true, email: true },
    });
    candByEmail.set(row.email, row.id);
  }
  console.log(`Candidates ready: ${candByEmail.size}`);

  // ── 4. Applications across pipeline stages (Pipeline page) ──────────────
  const emails = [...candByEmail.keys()];
  const STAGE = ["Screening", "PhoneScreen", "TechnicalInterview", "ManagerInterview", "HRInterview", "Offer", "Hired"];
  const APPS: { email: string; reqNum: string; stage: string; status: "AppActive" | "AppHired" | "AppRejected" | "AppOffered"; score: number }[] = [
    { email: emails[0], reqNum: "REQ-DEMO-001", stage: "TechnicalInterview", status: "AppActive", score: 88 },
    { email: emails[2], reqNum: "REQ-DEMO-001", stage: "PhoneScreen", status: "AppActive", score: 72 },
    { email: emails[6], reqNum: "REQ-DEMO-001", stage: "Screening", status: "AppRejected", score: 41 },
    { email: emails[1], reqNum: "REQ-DEMO-002", stage: "ManagerInterview", status: "AppActive", score: 90 },
    { email: emails[3], reqNum: "REQ-DEMO-003", stage: "Screening", status: "AppActive", score: 66 },
    { email: emails[5], reqNum: "REQ-DEMO-005", stage: "Hired", status: "AppHired", score: 95 },
  ];
  const appIds: { id: string; stage: string; email: string }[] = [];
  for (const a of APPS) {
    const candidateId = candByEmail.get(a.email);
    const requisitionId = reqByNum.get(a.reqNum);
    if (!candidateId || !requisitionId) continue;
    const stageIdx = STAGE.indexOf(a.stage);
    const stageHistory = STAGE.slice(0, stageIdx + 1).map((s, i) => ({ stage: s, at: addDays(new Date(), -14 + i * 2).toISOString() }));
    const row = await prisma.jobApplication.upsert({
      where: { orgId_candidateId_requisitionId: { orgId, candidateId, requisitionId } },
      update: { currentStage: a.stage, status: a.status, aiMatchScore: a.score, stageHistory, updatedBy: me.id },
      create: {
        orgId, candidateId, requisitionId, currentStage: a.stage, status: a.status,
        aiMatchScore: a.score, stageHistory, appliedDate: addDays(new Date(), -14),
        ...(a.status === "AppHired" ? { offerStatus: "OfferAccepted", offeredCTC: 2800000, offerJoiningDate: addDays(new Date(), 30) } : {}),
        createdBy: me.id, updatedBy: me.id,
      },
      select: { id: true },
    });
    appIds.push({ id: row.id, stage: a.stage, email: a.email });
  }
  console.log(`Applications ready: ${appIds.length}`);

  // ── 5. Interviews (Interviews page) ─────────────────────────────────────
  await prisma.interview.deleteMany({ where: { orgId, applicationId: { in: appIds.map((a) => a.id) } } });
  let interviewsCreated = 0;
  for (const [i, app] of appIds.entries()) {
    const stageIdx = STAGE.indexOf(app.stage);
    // A completed past interview for anyone who has cleared PhoneScreen.
    if (stageIdx >= 1) {
      await prisma.interview.create({
        data: {
          orgId, applicationId: app.id, round: 1, type: "Video", interviewerId: interviewerId(i),
          scheduledAt: addDays(new Date(), -6), duration: 45, status: "IntCompleted",
          overallRating: 4, recommendation: "Hire", strengths: "Solid problem-solving and clear communication.",
          concerns: "Limited exposure to large-scale systems.", overallComments: "Strong candidate, move forward.",
          scorecardSubmittedAt: addDays(new Date(), -5), createdBy: me.id, updatedBy: me.id,
        },
      });
      interviewsCreated++;
    }
    // An upcoming scheduled interview for active mid-pipeline candidates.
    if (app.stage === "TechnicalInterview" || app.stage === "ManagerInterview" || app.stage === "PhoneScreen") {
      await prisma.interview.create({
        data: {
          orgId, applicationId: app.id, round: 2, type: "Panel", interviewerId: interviewerId(i + 1),
          scheduledAt: addDays(new Date(), 3), duration: 60, status: "IntScheduled",
          meetingLink: "https://meet.google.com/demo-" + app.id.slice(-6),
          createdBy: me.id, updatedBy: me.id,
        },
      });
      interviewsCreated++;
    }
  }
  console.log(`Interviews created: ${interviewsCreated}`);

  // ── 6. Candidate Document Types (Candidate Document Types page) ─────────
  const DOC_TYPES: { code: string; name: string; required: boolean; help?: string }[] = [
    { code: "PAN", name: "PAN Card", required: true, help: "Clear scan of your PAN card." },
    { code: "AADHAAR", name: "Aadhaar Card", required: true, help: "Front and back." },
    { code: "RESUME", name: "Updated Resume", required: true },
    { code: "PAYSLIP", name: "Last 3 Payslips", required: false, help: "Most recent 3 months." },
    { code: "OFFER_PREV", name: "Previous Offer Letter", required: false },
    { code: "RELIEVING", name: "Relieving Letter", required: true },
    { code: "EDU_CERT", name: "Education Certificates", required: true, help: "10th, 12th, Graduation." },
    { code: "BANK", name: "Cancelled Cheque / Passbook", required: true },
  ];
  let docTypes = 0;
  for (const [i, d] of DOC_TYPES.entries()) {
    await prisma.candidateDocumentType.upsert({
      where: { orgId_code: { orgId, code: d.code } },
      update: { name: d.name, isRequired: d.required, helpText: d.help ?? null, sortOrder: i, isActive: true, updatedBy: me.id },
      create: { orgId, code: d.code, name: d.name, isRequired: d.required, helpText: d.help ?? null, sortOrder: i, isActive: true, createdBy: me.id, updatedBy: me.id },
    });
    docTypes++;
  }
  console.log(`Candidate document types ready: ${docTypes}`);

  console.log("\n✅ Recruit module demo data seeded.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
