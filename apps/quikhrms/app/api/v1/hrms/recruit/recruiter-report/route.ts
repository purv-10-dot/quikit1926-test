import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, validationError, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { countBusinessDays, daysBetween, computeStageTat, getHolidayDateSet, median } from "@/lib/recruit/sla";
import { computeRecruiterScore, type KpiInput } from "@/lib/recruit/scoring";
import { computePipelineTargetActuals } from "@/lib/recruit/pipeline-targets";
import { stageNames, prettyStage } from "@/lib/services/pipeline-stages";
import type { ExplainItem } from "../recruiter-performance/route";

/**
 * GET /api/v1/hrms/recruit/recruiter-report — a single recruiter's complete
 * activity for an arbitrary date range (daily/weekly/custom), for the "My
 * Home" report filter + Excel export.
 *
 * Unlike /recruiter-performance (a LIVE snapshot — "as of right now"), every
 * number here is scoped to activity that actually happened inside
 * [from, to]: an interview that was scheduled in the window, an offer sent
 * in the window, a requisition closed in the window, etc. An in-flight seat
 * that hasn't produced an event yet inside the window simply doesn't count —
 * a report answers "what happened", not "what's currently pending".
 */

const DEFAULT_POSITION_TO_OFFER_SLA = 15;

const querySchema = z.object({
  recruiterId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "from must be YYYY-MM-DD"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "to must be YYYY-MM-DD"),
});

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.performance.read");
    const canSeeSelf = canSeeAll || permissions.includes("hrms.recruit.performance.read_self");
    if (!canSeeSelf) return forbidden("No recruiter-performance read permission");

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      recruiterId: searchParams.get("recruiterId") ?? "",
      from: searchParams.get("from") ?? "",
      to: searchParams.get("to") ?? "",
    });
    if (!parsed.success) return validationError("Invalid query params", parsed.error.flatten());
    const { recruiterId, from, to } = parsed.data;

    const callerEmployeeId = await resolveEmployeeId(orgId, ctx.userId);
    // A self-only caller can only ever pull their own report.
    if (!canSeeAll && recruiterId !== callerEmployeeId) return forbidden("Can only view your own report");

    const rangeStart = new Date(`${from}T00:00:00.000Z`);
    const rangeEnd = new Date(`${to}T23:59:59.999Z`);
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeEnd < rangeStart) {
      return validationError("Invalid date range");
    }

    const recruiter = await prisma.employee.findFirst({ where: { id: recruiterId, orgId }, select: { id: true, firstName: true, lastName: true } });
    if (!recruiter) return validationError("Unknown recruiterId");
    const recruiterName = `${recruiter.firstName} ${recruiter.lastName}`.trim();

    // Only requisitions THIS recruiter is on (current split, or the legacy
    // single-recruiter scalar) — never the whole org's, unlike the
    // all-recruiters dashboard query.
    const requisitions = await prisma.jobRequisition.findMany({
      where: {
        orgId, deletedAt: null,
        OR: [
          { recruiterId },
          { recruiterSplits: { some: { employeeId: recruiterId, deletedAt: null } } },
        ],
      },
      select: {
        id: true, title: true, requisitionNumber: true, status: true,
        positions: true, filledPositions: true, createdAt: true, actualClosedAt: true, jobLevelId: true,
        targetJoiningDate: true, originalTargetJoiningDate: true,
        recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true } },
      },
    });
    const requisitionIds = requisitions.map((r) => r.id);
    const reqById = new Map(requisitions.map((r) => [r.id, r]));

    if (requisitionIds.length === 0) {
      return successResponse(emptyReport(recruiter.id, recruiterName, from, to));
    }

    const jobLevels = await prisma.jobLevel.findMany({ where: { orgId, deletedAt: null }, select: { id: true, slaDays: true, positionToOfferSlaDays: true, sourcedToInterviewSlaDays: true } });
    const positionToOfferSlaByLevel = new Map(jobLevels.map((l) => [l.id, l.positionToOfferSlaDays]));
    const sourcedToInterviewSlaByLevel = new Map(jobLevels.map((l) => [l.id, l.sourcedToInterviewSlaDays]));
    const slaDaysByLevel = new Map(jobLevels.map((l) => [l.id, l.slaDays]));

    // "Primary" recruiter per requisition (first split, or the legacy
    // scalar) — same attribution rule /recruiter-performance uses for
    // candidate-level activity.
    const primaryByReq = new Map<string, string | null>();
    for (const r of requisitions) {
      const primary = r.recruiterSplits[0]?.employeeId ?? recruiterId;
      primaryByReq.set(r.id, primary);
    }

    const earliestCreatedAt = requisitions.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), requisitions[0].createdAt);
    const holidayDates = await getHolidayDateSet(orgId, earliestCreatedAt < rangeStart ? earliestCreatedAt : rangeStart, rangeEnd);

    // RequisitionPosition isn't in the generated Prisma client yet — raw SQL,
    // scoped to just this recruiter's seats.
    const positionRows = await prisma.$queryRaw<{ id: string; requisitionId: string; positionCode: string; createdAt: Date; assignedAt: Date | null; filledAt: Date | null; status: string; slaRevisionCount: number }[]>`
      SELECT id, "requisitionId", "positionCode", "createdAt", "assignedAt", "filledAt", status, "slaRevisionCount" FROM "app_quikhrms"."RequisitionPosition"
      WHERE "orgId" = ${orgId} AND "recruiterId" = ${recruiterId} AND "deletedAt" IS NULL
      ORDER BY "sequenceNo" ASC`;
    // Earliest position-assignment per requisition — starts this recruiter's
    // Position → Offer TAT clock on that requisition.
    const assignedAtByReq = new Map<string, Date>();
    for (const p of positionRows) {
      if (!p.assignedAt) continue;
      const cur = assignedAtByReq.get(p.requisitionId);
      if (!cur || p.assignedAt < cur) assignedAtByReq.set(p.requisitionId, p.assignedAt);
    }

    const applications = await prisma.jobApplication.findMany({
      where: { orgId, deletedAt: null, requisitionId: { in: requisitionIds } },
      select: {
        id: true, requisitionId: true, candidateId: true, status: true, currentStage: true, appliedDate: true,
        offerStatus: true, offerSentAt: true, offerRespondedAt: true, offerJoiningDate: true, offerExpiresAt: true,
        offerDeclineReason: true, rejectionReason: true, parkedReason: true, hiredAt: true, stageHistory: true,
        candidate: { select: { firstName: true, lastName: true } },
      },
    });
    const applicationIds = applications.map((a) => a.id);
    // "Mine" — this recruiter is the requisition's primary recruiter (same
    // attribution the live dashboard uses for interviews/offers/hires).
    const myApps = applications.filter((a) => primaryByReq.get(a.requisitionId) === recruiterId);

    // Fetched here (not down by the Recruitment Funnel section that also uses
    // it) so interviewItems below can resolve each Interview's `round` — a
    // 1-based index into the requisition's pipeline stages, stamped at
    // scheduling time (pipeline/page.tsx's scheduleMut) — back into an actual
    // stage name instead of showing a meaningless "round 4".
    const hiringPipeline = await prisma.hiringPipeline.findFirst({ where: { orgId, isDefault: true, deletedAt: null }, select: { stages: true } });
    const funnelStageOrder = (() => {
      const names = stageNames(hiringPipeline?.stages);
      return names.length ? names : ["Screening", "PhoneScreen", "HRInterview", "Offer", "Hired"];
    })();
    const roundToStageName = (round: number): string => funnelStageOrder[round - 1] ?? `Round ${round}`;

    const interviews = applicationIds.length
      ? await prisma.interview.findMany({
          where: { orgId, deletedAt: null, applicationId: { in: applicationIds } },
          select: { id: true, applicationId: true, scheduledAt: true, type: true, round: true },
        })
      : [];
    const earliestInterviewByApp = new Map<string, Date>();
    for (const iv of interviews) {
      const cur = earliestInterviewByApp.get(iv.applicationId);
      if (!cur || iv.scheduledAt < cur) earliestInterviewByApp.set(iv.applicationId, iv.scheduledAt);
    }

    const inRange = (d: Date | null) => !!d && d >= rangeStart && d <= rangeEnd;

    // ── Interviews / Offers / Hires — events that happened inside the window ──
    const interviewItems = interviews
      .filter((iv) => myApps.some((a) => a.id === iv.applicationId) && inRange(iv.scheduledAt))
      .map((iv) => {
        const app = applications.find((a) => a.id === iv.applicationId)!;
        return {
          id: iv.id, candidateId: app.candidateId, name: `${app.candidate.firstName} ${app.candidate.lastName}`.trim(),
          requisitionTitle: reqById.get(app.requisitionId)?.title ?? "Unknown", type: iv.type, round: iv.round,
          stageName: prettyStage(roundToStageName(iv.round)),
          scheduledAt: iv.scheduledAt.toISOString(),
        };
      });
    const offerItems = myApps
      .filter((a) => inRange(a.offerSentAt))
      .map((a) => ({
        id: a.id, candidateId: a.candidateId, name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
        requisitionTitle: reqById.get(a.requisitionId)?.title ?? "Unknown", offerStatus: a.offerStatus, offerSentAt: a.offerSentAt!.toISOString(),
      }));
    const hireApps = myApps.filter((a) => a.status === "AppHired" && inRange(a.hiredAt));
    const hireItems = hireApps.map((a) => ({
      id: a.id, candidateId: a.candidateId, name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
      requisitionTitle: reqById.get(a.requisitionId)?.title ?? "Unknown", hiredAt: a.hiredAt!.toISOString(),
    }));

    // ── Time-to-Fill / Time-to-Hire — closures/hires that landed in the window ──
    const closedInRange = requisitions.filter((r) => r.status === "ReqClosed" && inRange(r.actualClosedAt));
    const fillDays = closedInRange.map((r) => countBusinessDays(r.createdAt, r.actualClosedAt!, holidayDates));
    const hireDays = hireApps.map((a) => countBusinessDays(a.appliedDate, a.hiredAt!, holidayDates));

    // ── Position → Offer TAT — offers actually sent inside the window ──
    let positionToOfferInTat = 0, positionToOfferMissed = 0, positionToOfferNotRated = 0;
    for (const a of offerItems) {
      const req = reqById.get(applications.find((x) => x.id === a.id)!.requisitionId);
      const sla = req?.jobLevelId ? positionToOfferSlaByLevel.get(req.jobLevelId) ?? null : null;
      const assignedAt = req ? assignedAtByReq.get(req.id) ?? null : null;
      const result = computeStageTat(assignedAt, new Date(a.offerSentAt), sla, rangeEnd);
      if (result.status === "IN_TAT") positionToOfferInTat++;
      else if (result.status === "MISSED") positionToOfferMissed++;
      else positionToOfferNotRated++;
    }

    // ── Sourced → Interview TAT — first-ever interview landed inside the window ──
    let sourcedToInterviewInTat = 0, sourcedToInterviewMissed = 0, sourcedToInterviewNotRated = 0;
    for (const a of myApps) {
      const firstInterview = earliestInterviewByApp.get(a.id) ?? null;
      if (!firstInterview || !inRange(firstInterview)) continue;
      const jobLevelId = reqById.get(a.requisitionId)?.jobLevelId ?? null;
      const sla = jobLevelId ? sourcedToInterviewSlaByLevel.get(jobLevelId) ?? null : null;
      const result = computeStageTat(a.appliedDate, firstInterview, sla, rangeEnd);
      if (result.status === "IN_TAT") sourcedToInterviewInTat++;
      else if (result.status === "MISSED") sourcedToInterviewMissed++;
      else sourcedToInterviewNotRated++;
    }

    // ── Positions closed (seats filled) inside the window ──
    const filledInRange = positionRows.filter((p) => p.status === "Filled" && inRange(p.filledAt));
    const closeDays = filledInRange.map((p) => countBusinessDays(p.createdAt, p.filledAt!, holidayDates));

    // ── Escalations + Date Revisions raised inside the window (full detail, not just a count) ──
    const escalationNotifs = await prisma.hrmsNotification.findMany({
      where: { orgId, employeeId: recruiterId, entityType: "JobRequisition", title: { in: ["SLA breached", "SLA breach escalation"] }, createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { id: true, title: true, message: true, entityId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const escalationsDetail = escalationNotifs.map((n) => ({
      id: n.id, title: n.title, message: n.message,
      requisitionTitle: n.entityId ? reqById.get(n.entityId)?.title ?? "Unknown" : "Unknown",
      createdAt: n.createdAt.toISOString(),
    }));

    const revisionLogs = await prisma.hrmsAuditLog.findMany({
      where: { orgId, entityType: "Requisition", entityId: { in: requisitionIds }, action: "Update", createdAt: { gte: rangeStart, lte: rangeEnd } },
      select: { entityId: true, changes: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const dateRevisionsDetail: { requisitionTitle: string; detail: string; createdAt: string }[] = [];
    for (const l of revisionLogs) {
      const c = l.changes as unknown as Record<string, unknown> | null;
      if (!c) continue;
      const fields = ["closedDate", "targetJoiningDate"].filter((f) => f in c);
      if (fields.length === 0) continue;
      dateRevisionsDetail.push({
        requisitionTitle: l.entityId ? reqById.get(l.entityId)?.title ?? "Unknown" : "Unknown",
        detail: `${fields.join(", ")} revised`,
        createdAt: l.createdAt.toISOString(),
      });
    }
    const dateRevisionsInRange = dateRevisionsDetail.length;

    // ── Daily pipeline-throughput targets vs actuals, for this exact range —
    // doubles as the SLA Compliance KPI's input below. ──
    const pipelineTargets = await computePipelineTargetActuals(orgId, { from: rangeStart, to: rangeEnd, recruiterId });

    // ── 8-KPI Score, scoped to whatever was ASSIGNED inside the window ──
    const assignedRows = applicationIds.length
      ? await prisma.$queryRaw<{ id: string; assignedRecruiterId: string | null; assignedRecruiterAt: Date | null }[]>`
          SELECT id, "assignedRecruiterId", "assignedRecruiterAt" FROM "app_quikhrms"."JobApplication"
          WHERE id IN (${Prisma.join(applicationIds)})`
      : [];
    const assignedInfoByApp = new Map(assignedRows.map((r) => [r.id, { recruiterId: r.assignedRecruiterId, assignedAt: r.assignedRecruiterAt }]));
    const myAssignedApps = applications.filter((a) => {
      const info = assignedInfoByApp.get(a.id);
      return info?.recruiterId === recruiterId && inRange(info.assignedAt);
    });
    const hireTargetFor = (a: (typeof myAssignedApps)[number]) => {
      const lvl = reqById.get(a.requisitionId)?.jobLevelId ?? null;
      return (lvl && slaDaysByLevel.get(lvl)) || DEFAULT_POSITION_TO_OFFER_SLA * 2;
    };
    const nameOf2 = (a: (typeof myAssignedApps)[number]) => `${a.candidate.firstName} ${a.candidate.lastName}`.trim();
    const reqTitleOf2 = (a: (typeof myAssignedApps)[number]) => reqById.get(a.requisitionId)?.title ?? "Unknown";
    const avg = (nums: number[]) => nums.reduce((s, v) => s + v, 0) / nums.length;

    // 1. Time to Offer — deadline-discipline, not a day-count: a missed
    // Position→Offer deadline always gets a Revise SLA, so slaRevisionCount
    // is a direct proxy for "how many times this seat missed its offer
    // deadline". Scored per position assigned in this range: 0 revisions →
    // 100, 1 → 50, 2+ → 0.
    const assignedPositionsInRangeForOffer = positionRows.filter((p) => p.assignedAt && inRange(p.assignedAt) && p.status !== "Cancelled");
    const timeToOfferScores: number[] = [];
    const timeToOfferExplain: ExplainItem[] = [];
    for (const p of assignedPositionsInRangeForOffer) {
      const positionScore = p.slaRevisionCount === 0 ? 100 : p.slaRevisionCount === 1 ? 50 : 0;
      timeToOfferScores.push(positionScore);
      timeToOfferExplain.push({
        label: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
        outcome: p.slaRevisionCount === 0 ? "No Revision" : p.slaRevisionCount === 1 ? "Revised Once" : "Revised 2+ Times",
        detail: `${p.slaRevisionCount} revision${p.slaRevisionCount === 1 ? "" : "s"} · score ${positionScore}`,
      });
    }

    // 2. Time to Hire — candidate sourced → hired/onboarded, ratio vs level's overall SLA.
    const timeToHireRatios: number[] = [];
    const timeToHireExplain: ExplainItem[] = [];
    for (const a of myAssignedApps) {
      if (a.status !== "AppHired" || !a.hiredAt) continue;
      const target = hireTargetFor(a);
      const actualDays = daysBetween(a.appliedDate, a.hiredAt);
      const ratio = actualDays / target;
      timeToHireRatios.push(ratio);
      timeToHireExplain.push({ label: nameOf2(a), requisitionTitle: reqTitleOf2(a), outcome: ratio <= 1 ? "On Time" : "Late", detail: `${Math.round(actualDays)}d actual / ${target}d target (${ratio.toFixed(2)}×)` });
    }

    // 3. SLA Compliance — average Pipeline Target achievement for this
    // exact range, over stages/levels this recruiter actually had activity in.
    const relevantPipelineRows = pipelineTargets.rows.filter((r) => r.achievementPct != null && r.actual > 0);
    const slaComplianceValue = relevantPipelineRows.length ? avg(relevantPipelineRows.map((r) => Math.min(100, r.achievementPct!))) : null;
    const slaComplianceExplain: ExplainItem[] = relevantPipelineRows.map((r) => ({
      label: `${r.levelCode} · ${prettyStage(r.stage)}`, requisitionTitle: "—",
      outcome: (r.achievementPct ?? 0) >= 100 ? "On Target" : "Below Target",
      detail: `${r.actual}/${r.totalTarget} in range (${r.achievementPct}%)`,
    }));

    // 4. Interview → Offer
    const interviewedAssignedApps = myAssignedApps.filter((a) => earliestInterviewByApp.has(a.id));
    const offeredAfterInterview = interviewedAssignedApps.filter((a) => !!a.offerSentAt).length;
    const interviewToOfferExplain: ExplainItem[] = interviewedAssignedApps.map((a) => ({
      label: nameOf2(a), requisitionTitle: reqTitleOf2(a),
      outcome: a.offerSentAt ? "Got Offer" : "No Offer Yet",
      detail: a.offerSentAt ? "Offer sent after interview" : (a.status === "AppRejected" ? "Rejected after interview" : "Still in process"),
    }));

    // 5. Offer Acceptance Rate — mature offers only (outcome already decided).
    const offeredApps = myAssignedApps.filter((a) => !!a.offerSentAt);
    const matureOffers = offeredApps.filter((a) => !!a.offerRespondedAt
      || ["OfferAccepted", "OfferDeclined", "OfferRevoked", "OfferExpired"].includes(a.offerStatus ?? "")
      || (a.offerExpiresAt && a.offerExpiresAt < rangeEnd));
    const acceptedOffers = matureOffers.filter((a) => a.offerStatus === "OfferAccepted");
    const offerAcceptanceExplain: ExplainItem[] = matureOffers.map((a) => ({
      label: nameOf2(a), requisitionTitle: reqTitleOf2(a),
      outcome: a.offerStatus === "OfferAccepted" ? "Accepted" : "Not Accepted",
      detail: a.offerStatus === "OfferAccepted" ? "Offer accepted" : (a.offerDeclineReason ?? a.offerStatus ?? "Not accepted"),
    }));

    // 6. Offer → Joining Ratio — of accepted offers, how many actually joined.
    const matureForJoining = acceptedOffers.filter((a) => a.status === "AppHired"
      || (a.offerJoiningDate && a.offerJoiningDate < rangeEnd)
      || a.status === "AppRejected" || a.status === "AppWithdrawn");
    const joinedFromAccepted = matureForJoining.filter((a) => a.status === "AppHired" && a.hiredAt).length;
    const offerToJoiningExplain: ExplainItem[] = matureForJoining.map((a) => ({
      label: nameOf2(a), requisitionTitle: reqTitleOf2(a),
      outcome: a.status === "AppHired" ? "Joined" : "Did Not Join",
      detail: a.status === "AppHired" ? "Onboarding complete" : (a.rejectionReason ?? "Dropped before joining"),
    }));

    // 7. Position Closure Rate — seats closed in range ÷ seats assigned in range.
    const assignedPositionsInRange = assignedPositionsInRangeForOffer;
    const positionClosureExplain: ExplainItem[] = filledInRange.map((p) => ({
      label: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
      outcome: "Closed", detail: p.filledAt ? `Filled ${p.filledAt.toISOString().slice(0, 10)}` : "Filled",
    }));

    // 8. Recruitment Process Compliance — same reason-logged checks as the
    // live dashboard, plus: every assigned seat that was never SLA-revised.
    const needsRejectionReason = myAssignedApps.filter((a) => a.status === "AppRejected");
    const needsDeclineReason = myAssignedApps.filter((a) => a.offerStatus === "OfferDeclined");
    const needsParkedReason = myAssignedApps.filter((a) => a.status === "AppParked");
    const complianceTotal = needsRejectionReason.length + needsDeclineReason.length + needsParkedReason.length + assignedPositionsInRange.length;
    const compliancePassed = needsRejectionReason.filter((a) => !!a.rejectionReason).length
      + needsDeclineReason.filter((a) => !!a.offerDeclineReason).length
      + needsParkedReason.filter((a) => !!a.parkedReason).length
      + assignedPositionsInRange.filter((p) => p.slaRevisionCount === 0).length;
    const processComplianceExplain: ExplainItem[] = [
      ...needsRejectionReason.map((a) => ({ label: nameOf2(a), requisitionTitle: reqTitleOf2(a), outcome: a.rejectionReason ? "Reason Given" : "Missing Reason", detail: a.rejectionReason ?? "Rejected without a reason logged" })),
      ...needsDeclineReason.map((a) => ({ label: nameOf2(a), requisitionTitle: reqTitleOf2(a), outcome: a.offerDeclineReason ? "Reason Given" : "Missing Reason", detail: a.offerDeclineReason ?? "Declined without a reason logged" })),
      ...needsParkedReason.map((a) => ({ label: nameOf2(a), requisitionTitle: reqTitleOf2(a), outcome: a.parkedReason ? "Reason Given" : "Missing Reason", detail: a.parkedReason ?? "Parked without a reason logged" })),
      ...assignedPositionsInRange.map((p) => ({ label: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown", outcome: p.slaRevisionCount === 0 ? "No SLA Revision" : "SLA Revised", detail: p.slaRevisionCount === 0 ? "Deadline never pushed out" : `Revised ${p.slaRevisionCount}×` })),
    ];

    const scoreInputs: KpiInput[] = [
      { code: "TIME_TO_OFFER", value: timeToOfferScores.length ? avg(timeToOfferScores) : null, sampleSize: timeToOfferScores.length },
      { code: "TIME_TO_HIRE", value: timeToHireRatios.length ? avg(timeToHireRatios) : null, sampleSize: timeToHireRatios.length },
      { code: "SLA_COMPLIANCE", value: slaComplianceValue, sampleSize: relevantPipelineRows.length },
      { code: "INTERVIEW_TO_OFFER", value: interviewedAssignedApps.length ? (offeredAfterInterview / interviewedAssignedApps.length) * 100 : null, sampleSize: interviewedAssignedApps.length },
      { code: "OFFER_ACCEPTANCE", value: matureOffers.length ? (acceptedOffers.length / matureOffers.length) * 100 : null, sampleSize: matureOffers.length },
      { code: "OFFER_TO_JOINING", value: matureForJoining.length ? (joinedFromAccepted / matureForJoining.length) * 100 : null, sampleSize: matureForJoining.length },
      { code: "POSITION_CLOSURE", value: assignedPositionsInRange.length ? (filledInRange.length / assignedPositionsInRange.length) * 100 : null, sampleSize: assignedPositionsInRange.length },
      { code: "PROCESS_COMPLIANCE", value: complianceTotal ? (compliancePassed / complianceTotal) * 100 : null, sampleSize: complianceTotal },
    ];
    const score = computeRecruiterScore(scoreInputs);
    const scoreExplain: Record<string, ExplainItem[]> = {
      TIME_TO_OFFER: timeToOfferExplain, TIME_TO_HIRE: timeToHireExplain, SLA_COMPLIANCE: slaComplianceExplain,
      INTERVIEW_TO_OFFER: interviewToOfferExplain, OFFER_ACCEPTANCE: offerAcceptanceExplain,
      OFFER_TO_JOINING: offerToJoiningExplain, POSITION_CLOSURE: positionClosureExplain, PROCESS_COMPLIANCE: processComplianceExplain,
    };

    // ── Recruitment Funnel — same cumulative "ever reached this stage" logic
    // as the live dashboard, scoped to this recruiter's own candidates
    // (myApps — not range-filtered, since a funnel is workload shape, not
    // "what happened this week"). ──
    const reachedCounts = new Map<string, number>();
    for (const a of myApps) {
      const history = Array.isArray(a.stageHistory) ? (a.stageHistory as unknown[]) : [];
      const visited = new Set<string>();
      for (const h of history) {
        if (h && typeof h === "object" && typeof (h as { stage?: unknown }).stage === "string") visited.add((h as { stage: string }).stage);
      }
      if (a.currentStage) visited.add(a.currentStage);
      if (a.status === "AppHired") visited.add("Hired");
      for (const stage of funnelStageOrder) {
        if (visited.has(stage)) reachedCounts.set(stage, (reachedCounts.get(stage) ?? 0) + 1);
      }
    }
    const funnelTotal = reachedCounts.get(funnelStageOrder[0]) ?? 0;
    let prevStageCount = funnelTotal;
    const funnel = funnelStageOrder.map((stage, i) => {
      const count = reachedCounts.get(stage) ?? 0;
      const stagePct = i === 0 ? null : (prevStageCount > 0 ? Math.round((count / prevStageCount) * 1000) / 10 : 0);
      const overallPct = funnelTotal > 0 ? Math.round((count / funnelTotal) * 1000) / 10 : 0;
      prevStageCount = count;
      return { stage, label: prettyStage(stage), count, stagePct, overallPct };
    });

    // ── Full A-Z detail lists — every requisition/position this recruiter is
    // on (a workload snapshot, not range-filtered — status is point-in-time),
    // and every candidate attributed to them (not just the interviewed/
    // offered/hired subsets already broken out above). ──
    const requisitionsList = requisitions.map((r) => ({
      id: r.id, title: r.title, requisitionNumber: r.requisitionNumber, status: r.status,
      positions: r.positions, filledPositions: r.filledPositions,
    }));
    const positionsList = positionRows.map((p) => ({
      id: p.id, positionCode: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
      status: p.status, assignedAt: p.assignedAt ? p.assignedAt.toISOString() : null, filledAt: p.filledAt ? p.filledAt.toISOString() : null,
    }));
    const allCandidatesList = myApps.map((a) => ({
      id: a.id, candidateId: a.candidateId, name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
      requisitionTitle: reqById.get(a.requisitionId)?.title ?? "Unknown", status: a.status, currentStage: a.currentStage,
      appliedDate: a.appliedDate.toISOString(),
    }));

    // ── Positions closed in range, grouped by requisition — for the
    // "Requisition-wise Positions Closed" bar chart. ──
    const closedByReqCounts = new Map<string, number>();
    for (const p of filledInRange) {
      const title = reqById.get(p.requisitionId)?.title ?? "Unknown";
      closedByReqCounts.set(title, (closedByReqCounts.get(title) ?? 0) + 1);
    }
    const positionsClosedByRequisition = [...closedByReqCounts.entries()]
      .map(([requisitionTitle, count]) => ({ requisitionTitle, count }))
      .sort((a, b) => b.count - a.count);

    // ── Interviews/Offers/Hires trend across the window — daily buckets for
    // a range up to 31 days, weekly buckets beyond that (a day-by-day trend
    // over several months is just noise). ──
    const totalRangeDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
    const weeklyBuckets = totalRangeDays > 31;
    const bucketBounds: { start: Date; end: Date; label: string }[] = [];
    if (weeklyBuckets) {
      let cursor = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const start = new Date(cursor);
        const end = new Date(start); end.setDate(end.getDate() + 7);
        bucketBounds.push({ start, end, label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
        cursor = end;
      }
    } else {
      for (let i = 0; i < totalRangeDays; i++) {
        const start = new Date(rangeStart); start.setDate(start.getDate() + i); start.setHours(0, 0, 0, 0);
        const end = new Date(start); end.setDate(end.getDate() + 1);
        bucketBounds.push({ start, end, label: start.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) });
      }
    }
    const countInBucket = (dates: Date[], start: Date, end: Date) => dates.filter((d) => d >= start && d < end).length;
    const interviewDates = interviewItems.map((iv) => new Date(iv.scheduledAt));
    const offerDates = offerItems.map((o) => new Date(o.offerSentAt));
    const hireDates = hireItems.map((h) => new Date(h.hiredAt));
    const trend = bucketBounds.map((b) => ({
      bucket: b.label,
      interviews: countInBucket(interviewDates, b.start, b.end),
      offers: countInBucket(offerDates, b.start, b.end),
      hires: countInBucket(hireDates, b.start, b.end),
    }));

    return successResponse({
      recruiter: { id: recruiter.id, name: recruiterName },
      range: { from, to },
      interviews: { count: interviewItems.length, items: interviewItems },
      offers: { count: offerItems.length, items: offerItems },
      hires: { count: hireItems.length, items: hireItems },
      timeToFill: {
        avgDays: fillDays.length ? Math.round(fillDays.reduce((s, v) => s + v, 0) / fillDays.length) : null,
        medianDays: median(fillDays), closedCount: closedInRange.length,
      },
      timeToHire: {
        avgDays: hireDays.length ? Math.round(hireDays.reduce((s, v) => s + v, 0) / hireDays.length) : null,
        medianDays: median(hireDays),
      },
      positionToOfferTat: { inTat: positionToOfferInTat, missed: positionToOfferMissed, notRated: positionToOfferNotRated, sampleSize: offerItems.length },
      sourcedToInterviewTat: { inTat: sourcedToInterviewInTat, missed: sourcedToInterviewMissed, notRated: sourcedToInterviewNotRated, sampleSize: sourcedToInterviewInTat + sourcedToInterviewMissed + sourcedToInterviewNotRated },
      positionsClosed: {
        count: filledInRange.length,
        avgTimeToCloseDays: closeDays.length ? Math.round(closeDays.reduce((s, v) => s + v, 0) / closeDays.length) : null,
      },
      positionsClosedByRequisition,
      escalations: escalationsDetail.length,
      escalationsDetail,
      dateRevisions: dateRevisionsInRange,
      dateRevisionsDetail,
      requisitions: requisitionsList,
      positions: positionsList,
      allCandidates: allCandidatesList,
      trend,
      funnel,
      score,
      scoreExplain,
      pipelineTargets,
    });
  } catch (error: unknown) {
    console.error("GET /recruit/recruiter-report error:", error);
    return internalError();
  }
});

function emptyReport(recruiterId: string, recruiterName: string, from: string, to: string) {
  return {
    recruiter: { id: recruiterId, name: recruiterName },
    range: { from, to },
    interviews: { count: 0, items: [] }, offers: { count: 0, items: [] }, hires: { count: 0, items: [] },
    timeToFill: { avgDays: null, medianDays: null, closedCount: 0 },
    timeToHire: { avgDays: null, medianDays: null },
    positionToOfferTat: { inTat: 0, missed: 0, notRated: 0, sampleSize: 0 },
    sourcedToInterviewTat: { inTat: 0, missed: 0, notRated: 0, sampleSize: 0 },
    positionsClosed: { count: 0, avgTimeToCloseDays: null },
    positionsClosedByRequisition: [],
    escalations: 0, escalationsDetail: [],
    dateRevisions: 0, dateRevisionsDetail: [],
    requisitions: [], positions: [], allCandidates: [], trend: [], funnel: [],
    score: computeRecruiterScore([]), scoreExplain: {},
    pipelineTargets: { stages: [], rows: [], daysInRange: 1 },
  };
}
