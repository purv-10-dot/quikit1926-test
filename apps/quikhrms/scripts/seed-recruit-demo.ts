/**
 * Dummy data for the entire Recruit module — larger volume for a populated
 * dashboard/pipeline demo:
 *   • Requisitions             → JobRequisition rows (Open / Pending / Draft / OnHold / Closed / Cancelled)
 *   • Positions                → RequisitionPosition rows (Recruiter & Position Tracking)
 *   • Candidates               → Candidate rows (varied source / status / experience)
 *   • Pipeline                 → HiringPipeline + JobApplications spread across stages
 *   • Interviews                → Interview rows (scheduled + completed w/ scorecards)
 *   • Candidate Document Types  → CandidateDocumentType rows
 *
 * Idempotent: requisitions (by number), candidates (by email), applications
 * (by candidate+req) and doc types (by code) are upserted; demo
 * interviews are wiped for the demo applications before reinsert.
 *
 * Run:  npm run seed:recruit
 *   or  tsx --env-file=.env.local scripts/seed-recruit-demo.ts
 */

import crypto from "crypto";
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
// Same "-21d, then +3d per stage" backbone used for stageHistory — reused by
// interviews/candidate/application records too so every date across the
// Activity tab and Stage Timeline tells one consistent story instead of
// mixing backdated fields with fields that default to "now" (seed run time).
const stageDate = (stageIdx: number) => addDays(new Date(), -21 + stageIdx * 3);

async function main() {
  // ── Resolve org + demo people ──────────────────────────────────────────
  // Target org is overridable (SEED_ORG_ID) — same pattern as scripts/seed.ts.
  // Without it, ME_EMAIL can match MORE THAN ONE employee across DIFFERENT
  // orgs (e.g. a stray test record in a throwaway "My Company" tenant) —
  // findFirst() picks arbitrarily, silently seeding the wrong org. So when no
  // override is given, prefer the match whose org has a real company name.
  const targetOrgId = process.env.SEED_ORG_ID;
  const meCandidates = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      ...(targetOrgId ? { orgId: targetOrgId } : {}),
      OR: [
        { workEmail: { contains: ME_EMAIL, mode: "insensitive" } },
        { personalEmail: { contains: ME_EMAIL, mode: "insensitive" } },
      ],
    },
    select: { id: true, orgId: true, firstName: true },
  });
  let me =
    (meCandidates.length > 1
      ? (await (async () => {
          const settings = await prisma.companySettings.findMany({
            where: { orgId: { in: meCandidates.map((c) => c.orgId) } },
            select: { orgId: true, companyName: true },
          });
          const realOrgIds = new Set(settings.filter((s) => s.companyName && s.companyName !== "My Company").map((s) => s.orgId));
          return meCandidates.find((c) => realOrgIds.has(c.orgId));
        })())
      : meCandidates[0]) ??
    (await prisma.employee.findFirst({
      where: { deletedAt: null, status: "Active", ...(targetOrgId ? { orgId: targetOrgId } : {}) },
      orderBy: { employeeCode: "asc" },
      select: { id: true, orgId: true, firstName: true },
    }));
  if (!me) throw new Error("No employees found — seed employees first.");
  const orgId = me.orgId;

  const interviewers = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, status: "Active" },
    take: 6,
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
    { num: "REQ-DEMO-006", title: "Frontend Engineer", status: "ReqOpen" as const, priority: "High" as const, positions: 3, expMin: 2, expMax: 6, salMin: 1200000, salMax: 2200000 },
    { num: "REQ-DEMO-007", title: "QA Engineer", status: "ReqOpen" as const, priority: "Medium" as const, positions: 2, expMin: 2, expMax: 5, salMin: 900000, salMax: 1600000 },
    { num: "REQ-DEMO-008", title: "Data Analyst", status: "ReqOpen" as const, priority: "Medium" as const, positions: 1, expMin: 2, expMax: 5, salMin: 1000000, salMax: 1800000 },
    { num: "REQ-DEMO-009", title: "Talent Acquisition Specialist", status: "ReqOpen" as const, priority: "Low" as const, positions: 1, expMin: 2, expMax: 6, salMin: 900000, salMax: 1600000 },
    { num: "REQ-DEMO-010", title: "Enterprise Account Executive", status: "ReqOnHold" as const, priority: "High" as const, positions: 2, expMin: 4, expMax: 9, salMin: 1500000, salMax: 2800000 },
    { num: "REQ-DEMO-011", title: "Customer Success Manager", status: "ReqOpen" as const, priority: "Medium" as const, positions: 1, expMin: 3, expMax: 7, salMin: 1100000, salMax: 1900000 },
    { num: "REQ-DEMO-012", title: "Engineering Manager", status: "PendingApproval" as const, priority: "Urgent" as const, positions: 1, expMin: 8, expMax: 14, salMin: 3000000, salMax: 4500000 },
    { num: "REQ-DEMO-013", title: "UI/UX Designer", status: "ReqOpen" as const, priority: "Medium" as const, positions: 1, expMin: 2, expMax: 5, salMin: 1000000, salMax: 1800000 },
    { num: "REQ-DEMO-014", title: "Finance Analyst", status: "ReqDraft" as const, priority: "Low" as const, positions: 1, expMin: 2, expMax: 5, salMin: 900000, salMax: 1500000 },
    { num: "REQ-DEMO-015", title: "Site Reliability Engineer", status: "ReqOpen" as const, priority: "High" as const, positions: 2, expMin: 4, expMax: 9, salMin: 1900000, salMax: 3200000 },
    { num: "REQ-DEMO-016", title: "Recruiter (Internal)", status: "ReqCancelled" as const, priority: "Low" as const, positions: 1, expMin: 2, expMax: 6, salMin: 900000, salMax: 1600000 },
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

  // ── 2b. Positions (Recruiter & Position Tracking, Phase 1) ──────────────
  // RequisitionPosition isn't in the generated Prisma client yet — raw SQL,
  // same pattern as lib/services/requisition-positions.ts. First seat on
  // each requisition is assigned to `me`; the rest stay Open/Unallocated so
  // the "Assign Recruiter" picker has something to demo too.
  let positionsCreated = 0;
  for (const r of REQS) {
    const requisitionId = reqByNum.get(r.num);
    if (!requisitionId) continue;
    for (let seq = 1; seq <= r.positions; seq++) {
      const code = `${r.num}-${String(seq).padStart(2, "0")}`;
      const assignFirst = seq === 1;
      await prisma.$executeRaw`
        INSERT INTO "app_quikhrms"."RequisitionPosition"
          (id, "orgId", "requisitionId", "positionCode", "sequenceNo", "recruiterId", "assignedAt", status, "createdBy", "updatedBy", "createdAt", "updatedAt")
        VALUES (${crypto.randomUUID()}, ${orgId}, ${requisitionId}, ${code}, ${seq},
                ${assignFirst ? me.id : null}, ${assignFirst ? addDays(new Date(), -12) : null}, 'Open',
                ${me.id}, ${me.id}, now(), now())
        ON CONFLICT ("orgId", "requisitionId", "sequenceNo") DO UPDATE
          SET "recruiterId" = ${assignFirst ? me.id : null}, "assignedAt" = ${assignFirst ? addDays(new Date(), -12) : null}`;
      positionsCreated++;
    }
  }
  console.log(`Positions ready: ${positionsCreated}`);

  // ── 3. Candidates (Candidates page) ─────────────────────────────────────
  const CANDIDATES: { first: string; last: string; exp: number; comp: string; des: string; source: string; status: "New" | "InPipeline" | "Hired" | "CandRejected" | "CandOnHold" | "Withdrawn"; rating: number | null }[] = [
    { first: "Aditya", last: "Nair", exp: 6, comp: "Infosys", des: "SDE III", source: "CandLinkedIn", status: "InPipeline", rating: 4.5 },
    { first: "Sneha", last: "Kulkarni", exp: 4, comp: "Zomato", des: "Product Designer", source: "CandReferral", status: "InPipeline", rating: 4.0 },
    { first: "Rohit", last: "Menon", exp: 8, comp: "Amazon", des: "Senior Engineer", source: "CandJobPortal", status: "InPipeline", rating: 3.5 },
    { first: "Fatima", last: "Sheikh", exp: 5, comp: "PhonePe", des: "HRBP", source: "CandInbound", status: "New", rating: null },
    { first: "Karan", last: "Malhotra", exp: 7, comp: "Flipkart", des: "DevOps Lead", source: "CandAgency", status: "New", rating: null },
    { first: "Divya", last: "Reddy", exp: 9, comp: "Freshworks", des: "Sales Manager", source: "CandCareerPage", status: "Hired", rating: 4.8 },
    { first: "Mohit", last: "Verma", exp: 3, comp: "Paytm", des: "Backend Engineer", source: "CandDirect", status: "CandRejected", rating: 2.5 },
    { first: "Priya", last: "Iyer", exp: 3, comp: "TCS", des: "QA Engineer", source: "CandNaukri", status: "InPipeline", rating: 3.8 },
    { first: "Arjun", last: "Kapoor", exp: 5, comp: "Wipro", des: "Frontend Engineer", source: "CandLinkedIn", status: "InPipeline", rating: 4.1 },
    { first: "Neha", last: "Joshi", exp: 4, comp: "Swiggy", des: "Data Analyst", source: "CandJobPortal", status: "InPipeline", rating: 3.6 },
    { first: "Vikram", last: "Rao", exp: 6, comp: "Razorpay", des: "SRE", source: "CandReferral", status: "InPipeline", rating: 4.3 },
    { first: "Anjali", last: "Desai", exp: 3, comp: "Ola", des: "UI/UX Designer", source: "CandCareerPage", status: "New", rating: null },
    { first: "Suresh", last: "Pillai", exp: 9, comp: "Byju's", des: "Engineering Manager", source: "CandAgency", status: "InPipeline", rating: 4.6 },
    { first: "Kavya", last: "Shetty", exp: 5, comp: "Myntra", des: "Customer Success Manager", source: "CandInbound", status: "New", rating: null },
    { first: "Rahul", last: "Gupta", exp: 4, comp: "Nykaa", des: "Frontend Engineer", source: "CandNaukri", status: "InPipeline", rating: 3.9 },
    { first: "Meera", last: "Nambiar", exp: 2, comp: "Cred", des: "QA Engineer", source: "CandCampus", status: "New", rating: null },
    { first: "Sanjay", last: "Bhatt", exp: 7, comp: "Dream11", des: "Enterprise AE", source: "CandLinkedIn", status: "InPipeline", rating: 4.0 },
    { first: "Pooja", last: "Agarwal", exp: 3, comp: "Meesho", des: "Talent Acquisition Specialist", source: "CandReferral", status: "New", rating: null },
    { first: "Vivek", last: "Krishnan", exp: 6, comp: "Groww", des: "SDE III", source: "CandJobPortal", status: "CandOnHold", rating: 3.7 },
    { first: "Ritu", last: "Chawla", exp: 4, comp: "Zepto", des: "Data Analyst", source: "CandCareerPage", status: "InPipeline", rating: 3.5 },
    { first: "Amitabh", last: "Sinha", exp: 10, comp: "Google", des: "Engineering Manager", source: "CandLinkedIn", status: "InPipeline", rating: 4.7 },
    { first: "Shreya", last: "Bose", exp: 3, comp: "Microsoft", des: "Product Designer", source: "CandReferral", status: "Withdrawn", rating: 3.2 },
    { first: "Nikhil", last: "Chauhan", exp: 5, comp: "Adobe", des: "Frontend Engineer", source: "CandJobPortal", status: "InPipeline", rating: 4.2 },
    { first: "Tanvi", last: "Mehta", exp: 2, comp: "Salesforce", des: "QA Engineer", source: "CandCampus", status: "New", rating: null },
    { first: "Gaurav", last: "Saxena", exp: 6, comp: "Accenture", des: "SRE", source: "CandNaukri", status: "InPipeline", rating: 3.9 },
    { first: "Ishita", last: "Bansal", exp: 4, comp: "Cognizant", des: "HRBP", source: "CandInbound", status: "New", rating: null },
    { first: "Deepak", last: "Yadav", exp: 3, comp: "HCL", des: "Customer Success Manager", source: "CandDirect", status: "CandRejected", rating: 2.8 },
    { first: "Ananya", last: "Pillai", exp: 5, comp: "Tech Mahindra", des: "UI/UX Designer", source: "CandLinkedIn", status: "InPipeline", rating: 4.0 },
    { first: "Rajesh", last: "Kumar", exp: 8, comp: "IBM", des: "Enterprise AE", source: "CandAgency", status: "InPipeline", rating: 3.8 },
    { first: "Swati", last: "Choudhary", exp: 4, comp: "Oracle", des: "Data Analyst", source: "CandIndeed", status: "InPipeline", rating: 3.6 },
  ];
  const candByEmail = new Map<string, string>();
  for (const c of CANDIDATES) {
    const email = `${c.first}.${c.last}@example.com`.toLowerCase();
    const row = await prisma.candidate.upsert({
      where: { orgId_email: { orgId, email } },
      // `createdAt` is refreshed on BOTH branches (like stageHistory below) —
      // otherwise a re-run only backdates it for brand-new candidates, and it
      // stays frozen at whatever "now" was on the ORIGINAL run for existing
      // ones, drifting out of sync with the freshly-recomputed stageHistory.
      update: {
        firstName: c.first, lastName: c.last, currentCompany: c.comp, currentDesignation: c.des,
        totalExperience: c.exp, source: c.source as never, status: c.status, rating: c.rating, updatedBy: me.id,
        createdAt: addDays(new Date(), -25),
      },
      create: {
        orgId, firstName: c.first, lastName: c.last, email, phone: "+9198" + String(10000000 + Math.floor(c.exp * 111111)),
        currentCompany: c.comp, currentDesignation: c.des, totalExperience: c.exp,
        currentCTC: 1000000 + c.exp * 150000, expectedCTC: 1400000 + c.exp * 200000, noticePeriod: 60,
        skills: ["JavaScript", "SQL", "Communication"], location: "Bengaluru", willingToRelocate: true,
        source: c.source as never, status: c.status, rating: c.rating, createdBy: me.id, updatedBy: me.id,
        // Backdated ahead of the earliest fake application date (-21d below)
        // so the Activity tab's "Candidate added to system" entry doesn't
        // land AFTER events that supposedly happened to them later.
        createdAt: addDays(new Date(), -25),
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
    { email: emails[4], reqNum: "REQ-DEMO-002", stage: "Offer", status: "AppOffered", score: 85 },
    { email: emails[3], reqNum: "REQ-DEMO-003", stage: "Screening", status: "AppActive", score: 66 },
    { email: emails[5], reqNum: "REQ-DEMO-005", stage: "Hired", status: "AppHired", score: 95 },
  ];
  // Auto-distribute the rest of the candidates across the ReqOpen requisitions
  // and stages, funnel-shaped (more at Screening, fewer at HR Interview) — a
  // handful sprinkled in as rejections for realism.
  const openReqNums = REQS.filter((r) => r.status === "ReqOpen").map((r) => r.num);
  const funnelStages = ["Screening", "Screening", "PhoneScreen", "PhoneScreen", "TechnicalInterview", "ManagerInterview", "HRInterview"];
  for (let i = 7; i < CANDIDATES.length; i++) {
    const email = emails[i];
    if (!email) continue;
    const reqNum = openReqNums[i % openReqNums.length];
    const stage = funnelStages[i % funnelStages.length];
    const rejected = i % 9 === 0;
    APPS.push({ email, reqNum, stage, status: rejected ? "AppRejected" : "AppActive", score: 55 + ((i * 7) % 40) });
  }

  const appIds: { id: string; stage: string; email: string }[] = [];
  for (const a of APPS) {
    const candidateId = candByEmail.get(a.email);
    const requisitionId = reqByNum.get(a.reqNum);
    if (!candidateId || !requisitionId) continue;
    const stageIdx = STAGE.indexOf(a.stage);
    const stageHistory = STAGE.slice(0, stageIdx + 1).map((s, i) => ({ stage: s, date: stageDate(i).toISOString() }));
    const row = await prisma.jobApplication.upsert({
      where: { orgId_candidateId_requisitionId: { orgId, candidateId, requisitionId } },
      // `appliedDate`/`createdAt` are refreshed here too (not just in
      // `create`) for the same reason as Candidate.createdAt above — a
      // re-run must recompute the whole fake timeline from "now", or it
      // drifts out of sync with the freshly-recomputed stageHistory.
      update: {
        currentStage: a.stage, status: a.status, aiMatchScore: a.score, stageHistory, updatedBy: me.id,
        appliedDate: addDays(new Date(), -21), createdAt: addDays(new Date(), -21),
        ...(a.status === "AppHired" ? { hiredAt: addDays(new Date(), -3), offerSentAt: addDays(new Date(), -10), offerRespondedAt: addDays(new Date(), -5) } : {}),
        ...(a.status === "AppOffered" ? { offerStatus: "OfferSent", offerSentAt: addDays(new Date(), -2) } : {}),
      },
      create: {
        orgId, candidateId, requisitionId, currentStage: a.stage, status: a.status,
        aiMatchScore: a.score, stageHistory, appliedDate: addDays(new Date(), -21),
        // Record itself "created" the day they applied, not "now" (the seed
        // run) — otherwise the Activity tab's "Offer created" entry (which
        // falls back to createdAt when offerCreatedAt is unset) shows today.
        createdAt: addDays(new Date(), -21),
        ...(a.status === "AppHired" ? {
          offerStatus: "OfferAccepted", offeredCTC: 2800000, offerJoiningDate: addDays(new Date(), 30),
          offerSentAt: addDays(new Date(), -10), offerRespondedAt: addDays(new Date(), -5), hiredAt: addDays(new Date(), -3),
        } : {}),
        ...(a.status === "AppOffered" ? { offerStatus: "OfferSent", offeredCTC: 2200000, offerSentAt: addDays(new Date(), -2) } : {}),
        createdBy: me.id, updatedBy: me.id,
      },
      select: { id: true },
    });
    appIds.push({ id: row.id, stage: a.stage, email: a.email });

    // JobApplication.updatedAt is a Prisma @updatedAt field — always "now" on
    // any write, so the "Application rejected" / "Candidate hired" Activity
    // entries (which read app.updatedAt) need a raw-SQL patch to backdate.
    // Passed as an ISO string, not a raw JS Date — $executeRaw's driver-level
    // Date handling was landing 5:30h off (the IST offset) from the intended
    // instant; an explicit UTC string sidesteps that ambiguity entirely.
    if (a.status === "AppRejected") {
      await prisma.$executeRaw`UPDATE "app_quikhrms"."JobApplication" SET "updatedAt" = ${stageDate(stageIdx).toISOString().slice(0, -1)}::timestamp WHERE id = ${row.id}`;
    } else if (a.status === "AppHired") {
      await prisma.$executeRaw`UPDATE "app_quikhrms"."JobApplication" SET "updatedAt" = ${addDays(new Date(), -3).toISOString().slice(0, -1)}::timestamp WHERE id = ${row.id}`;
    }
  }
  console.log(`Applications ready: ${appIds.length}`);

  // Mark REQ-DEMO-005's one seat as Filled (Divya Reddy, hired above) so
  // "Positions Closed" / "Onboarded" have real demo data too.
  const filledReqId = reqByNum.get("REQ-DEMO-005");
  const hiredApp = appIds.find((a) => a.stage === "Hired");
  if (filledReqId && hiredApp) {
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."RequisitionPosition"
      SET status = 'Filled', "filledByApplicationId" = ${hiredApp.id}, "filledAt" = ${addDays(new Date(), -3)}, "updatedBy" = ${me.id}, "updatedAt" = now()
      WHERE "orgId" = ${orgId} AND "requisitionId" = ${filledReqId} AND "sequenceNo" = 1`;
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."JobApplication" SET "positionId" = (
        SELECT id FROM "app_quikhrms"."RequisitionPosition"
        WHERE "orgId" = ${orgId} AND "requisitionId" = ${filledReqId} AND "sequenceNo" = 1
      ) WHERE id = ${hiredApp.id}`;
    await prisma.jobRequisition.update({ where: { id: filledReqId }, data: { filledPositions: 1 } });
  }

  // ── 5. Interviews (Interviews page) ─────────────────────────────────────
  await prisma.interview.deleteMany({ where: { orgId, applicationId: { in: appIds.map((a) => a.id) } } });
  let interviewsCreated = 0;
  for (const [i, app] of appIds.entries()) {
    const stageIdx = STAGE.indexOf(app.stage);
    // A completed past interview for anyone who has cleared PhoneScreen —
    // dated to when they entered PhoneScreen (round 1), not a fixed "-6d",
    // so it lines up with that same stage's date in the Stage Timeline
    // regardless of how far the candidate has since progressed.
    if (stageIdx >= 1) {
      const scheduledAt = stageDate(1);
      const completedAt = addDays(scheduledAt, 1);
      const iv = await prisma.interview.create({
        data: {
          orgId, applicationId: app.id, round: 1, type: "Video", interviewerId: interviewerId(i),
          scheduledAt, duration: 45, status: "IntCompleted",
          overallRating: 4, recommendation: "Hire", strengths: "Solid problem-solving and clear communication.",
          concerns: "Limited exposure to large-scale systems.", overallComments: "Strong candidate, move forward.",
          scorecardSubmittedAt: completedAt, createdBy: me.id, updatedBy: me.id,
          createdAt: addDays(scheduledAt, -1),
        },
        select: { id: true },
      });
      // Interview.updatedAt is a Prisma @updatedAt field (always "now" on any
      // write) — the Activity tab's "interview completed" entry reads it, so
      // it needs a raw-SQL patch to actually land on completedAt.
      await prisma.$executeRaw`UPDATE "app_quikhrms"."Interview" SET "updatedAt" = ${completedAt.toISOString().slice(0, -1)}::timestamp WHERE id = ${iv.id}`;
      interviewsCreated++;
    }
    // An upcoming scheduled interview for active mid-pipeline candidates —
    // genuinely a few days in the FUTURE from today (so the Interviews page
    // has near-term events to show); only its "invite created" timestamp is
    // backdated to when the candidate entered their current stage.
    if (app.stage === "TechnicalInterview" || app.stage === "ManagerInterview" || app.stage === "PhoneScreen") {
      await prisma.interview.create({
        data: {
          orgId, applicationId: app.id, round: 2, type: "Panel", interviewerId: interviewerId(i + 1),
          scheduledAt: addDays(new Date(), 3), duration: 60, status: "IntScheduled",
          meetingLink: "https://meet.google.com/demo-" + app.id.slice(-6),
          createdBy: me.id, updatedBy: me.id, createdAt: stageDate(stageIdx),
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
