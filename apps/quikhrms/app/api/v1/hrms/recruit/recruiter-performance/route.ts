import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { countBusinessDays, daysBetween, computeStageTat, computeDeadlineStatus, computeOriginalDeadlineStatus, getHolidayDateSet, median } from "@/lib/recruit/sla";
import { computeRecruiterScore, type KpiInput, type RecruiterScoreResult } from "@/lib/recruit/scoring";
import { computePipelineTargetActuals } from "@/lib/recruit/pipeline-targets";
import { stageNames, prettyStage } from "@/lib/services/pipeline-stages";

/**
 * GET /api/v1/hrms/recruit/recruiter-performance — Phase 1 MVP.
 *
 * Scope: HR_Head-style roles (hrms.recruit.performance.read) see every
 * recruiter; Recruiter-style roles (hrms.recruit.performance.read_self) only
 * ever see their own row, regardless of a `recruiterId` query param.
 *
 * Known Phase-1 limitation (by design, see the plan): candidate-level activity
 * (active candidates, interviews, offers, hires) is attributed to a
 * requisition's PRIMARY recruiter only — the first row in its recruiter
 * split (or the legacy single recruiterId). Precise per-candidate
 * attribution for genuinely multi-recruiter requisitions is Phase 2.
 */

const OPEN_STATUSES = new Set(["ReqOpen", "ReqOnHold", "PendingApproval", "ReqApproved"]);
const ACTIVE_APP_STATUSES = new Set(["AppActive", "AppOffered"]);

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
interface RecruiterRow {
  employeeId: string;
  name: string;
  activeRequisitions: number;
  positionsAssigned: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  offersSentThisWeek: number;
  hiresThisMonth: number;
  avgTimeToFillDays: number | null;
  medianTimeToFillDays: number | null;
  avgTimeToHireDays: number | null;
  medianTimeToHireDays: number | null;
  // Multi-Stage TAT — replaces the old single-clock Green/Amber/Red SLA.
  positionToOfferInTat: number;
  positionToOfferAtRisk: number;
  positionToOfferMissed: number;
  sourcedToInterviewInTat: number;
  sourcedToInterviewAtRisk: number;
  sourcedToInterviewMissed: number;
  deadlineOnTrack: number;
  deadlineAtRisk: number;
  deadlineMissed: number;
  // How many currently-on-track-or-revised requisitions had ALREADY blown
  // past their ORIGINAL (never-revised) commitment date.
  deadlineOriginalMissed: number;
  // Recruiter & Position Tracking (Phase 1) additions.
  positionsClosed: number;
  avgTimeToClosePositionDays: number | null;
  escalations: number;
  dateRevisions: number;
  // Exactly which seats are allocated to this recruiter — not just a count.
  positions: {
    id: string; positionCode: string; status: string; requisitionId: string; requisitionTitle: string; requisitionNumber: string;
    slaStatus: "IN_TAT" | "AT_RISK" | "MISSED" | null; rawSlaStatus: "IN_TAT" | "AT_RISK" | "MISSED" | null;
    daysLeft: number | null; slaRevisionCount: number; targetDays: number; daysExtended: number; revisedDeadline: string | null;
    filledCandidateId: string | null; filledCandidateName: string | null; slaRevisionReason: string | null;
    assignedAt: string | null; recruiterName: string;
    pipelineCandidates: { id: string; candidateId: string; name: string; currentStage: string | null; appliedDate: Date }[];
  }[];
  // Backing detail lists for the clickable stat cards — always just THIS
  // recruiter's own items, never someone else's or the full org list.
  activeRequisitionsList: { id: string; title: string; requisitionNumber: string; status: string; filledPositions: number; positions: number }[];
  activeCandidatesList: { id: string; candidateId: string; name: string; requisitionTitle: string; currentStage: string | null; appliedDate: Date }[];
  hiresThisMonthList: { id: string; candidateId: string; name: string; requisitionTitle: string; hiredAt: Date | null }[];
  interviewsThisWeekList: { id: string; candidateId: string; name: string; requisitionTitle: string; type: string; round: number; stageName: string; scheduledAt: Date }[];
  offersSentThisWeekList: { id: string; candidateId: string; name: string; requisitionTitle: string; offerStatus: string | null; offerSentAt: Date | null }[];
  // Performance Score (8-KPI weighted) — HR/Admin only for now; stripped
  // from the response for a self-scoped caller until explicitly turned on.
  score?: RecruiterScoreResult;
  // "Why is this number what it is" — the actual candidates/positions that
  // fed each KPI, one list per KPI code. Same HR/Admin-only gate as `score`.
  scoreExplain?: Record<string, ExplainItem[]>;
}

/** One row behind a KPI number — e.g. "Ravi Kumar — Late — 18d vs 15d target". `label` is a candidate name for most KPIs, or a position code for Process Compliance's SLA-revision check. */
export interface ExplainItem {
  label: string;
  requisitionTitle: string;
  outcome: string;
  detail: string;
}

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.performance.read");
    const canSeeSelf = canSeeAll || permissions.includes("hrms.recruit.performance.read_self");
    if (!canSeeSelf) return forbidden("No recruiter-performance read permission");

    const callerEmployeeId = await resolveEmployeeId(orgId, ctx.userId);
    const { searchParams } = new URL(req.url);
    const requestedRecruiterId = searchParams.get("recruiterId");
    // A self-only caller can never widen scope via the query param.
    const filterRecruiterId = canSeeAll ? requestedRecruiterId : callerEmployeeId;

    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const DEFAULT_POSITION_TO_OFFER_SLA = 15;

    const [requisitions, jobLevels, hiringPipeline] = await Promise.all([
      prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null },
        select: {
          id: true, title: true, requisitionNumber: true, status: true,
          positions: true, filledPositions: true, createdAt: true, actualClosedAt: true,
          recruiterId: true, jobLevelId: true, customSlaDays: true,
          slaPausedAt: true, slaPausedDays: true,
          targetJoiningDate: true, etaToFillDays: true,
          originalTargetJoiningDate: true, originalEtaToFillDays: true,
          recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true, positionsAssigned: true } },
          department: { select: { name: true } },
        },
      }),
      prisma.jobLevel.findMany({ where: { orgId, deletedAt: null }, select: { id: true, slaDays: true, positionToOfferSlaDays: true, sourcedToInterviewSlaDays: true } }),
      prisma.hiringPipeline.findFirst({ where: { orgId, isDefault: true, deletedAt: null }, select: { stages: true } }),
    ]);
    // Recruitment Funnel stage order — the org's configured Hiring Pipeline,
    // falling back to the built-in required stages if nothing's configured.
    // "Sourced" and "Onboard" bookend it (Screening IS the sourced stage;
    // Hired IS onboarding-complete — see lib/services/onboard-application.ts).
    const funnelStageOrder = (() => {
      const names = stageNames(hiringPipeline?.stages);
      return names.length ? names : ["Screening", "PhoneScreen", "HRInterview", "Offer", "Hired"];
    })();
    // An Interview's `round` is stamped at scheduling time as the 1-based
    // index into the requisition's OWN pipeline stage list (see pipeline/page.tsx's
    // scheduleMut: `STAGES.indexOf(scheduleApp.stage) + 1`) — not a meaningless
    // sequential counter. Reversing that against the org's default pipeline
    // (same simplification funnelStageOrder already makes; per-requisition
    // pipeline resolution is a later phase) turns "round 4" back into an
    // actual stage name ("Manager Interview") for display.
    const roundToStageName = (round: number): string => funnelStageOrder[round - 1] ?? `Round ${round}`;
    const positionToOfferSlaByLevel = new Map(jobLevels.map((l) => [l.id, l.positionToOfferSlaDays]));
    const sourcedToInterviewSlaByLevel = new Map(jobLevels.map((l) => [l.id, l.sourcedToInterviewSlaDays]));
    const slaDaysByLevel = new Map(jobLevels.map((l) => [l.id, l.slaDays]));

    // Org holidays, bounded from the earliest requisition on record to now —
    // every SLA/TAT business-day calculation below excludes weekends + these.
    const earliestCreatedAt = requisitions.length
      ? requisitions.reduce((min, r) => (r.createdAt < min ? r.createdAt : min), requisitions[0].createdAt)
      : now;
    const holidayDates = await getHolidayDateSet(orgId, earliestCreatedAt, now);

    // Per-requisition: its recruiter split (or a single-row fallback from the
    // legacy scalar) + a "primary" recruiter for candidate-level attribution.
    const splitsByReq = new Map<string, { employeeId: string; positionsAssigned: number }[]>();
    const primaryByReq = new Map<string, string | null>();
    for (const r of requisitions) {
      const splits = r.recruiterSplits.length
        ? r.recruiterSplits
        : r.recruiterId ? [{ employeeId: r.recruiterId, positionsAssigned: r.positions }] : [];
      splitsByReq.set(r.id, splits);
      primaryByReq.set(r.id, splits[0]?.employeeId ?? null);
    }

    // Every recruiter employeeId appearing anywhere, scoped down if the
    // caller can only see themselves.
    const allRecruiterIds = new Set<string>();
    for (const splits of splitsByReq.values()) for (const s of splits) allRecruiterIds.add(s.employeeId);
    const recruiterIds = filterRecruiterId
      ? (allRecruiterIds.has(filterRecruiterId) ? [filterRecruiterId] : [])
      : [...allRecruiterIds];

    if (recruiterIds.length === 0) {
      return successResponse({
        recruiters: [], orgAverage: null, funnel: [], stageTat: [], monthlyTrends: [], departmentBreakdown: [],
        kpiTrends: {
          newRequisitionsThisWeek: 0, requisitionsWowPct: null, newCandidatesThisWeek: 0, candidatesWowPct: null,
          hiresThisMonthTotal: 0, hiresLastMonthTotal: 0, hiresMomPct: null,
          offersMadeThisMonth: 0, offersMadeLastMonth: 0, offersMadeMomPct: null,
          positionsFilledThisMonth: 0, positionsFilledLastMonth: 0, positionsFilledMomPct: null,
          avgTimeToFillMomPct: null,
        },
        scope: canSeeAll ? "all" : "self",
      });
    }

    const recruiterEmployees = await prisma.employee.findMany({
      where: { id: { in: recruiterIds }, orgId },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(recruiterEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    const requisitionIds = requisitions.map((r) => r.id);
    const reqById = new Map(requisitions.map((r) => [r.id, r]));
    const departmentByReq = new Map(requisitions.map((r) => [r.id, r.department?.name ?? "Unassigned"]));

    // Recruiter & Position Tracking (Phase 1) — Positions Closed + Time to
    // Close, per recruiter. RequisitionPosition isn't in the generated Prisma
    // client yet, so it's fetched via raw SQL. Includes positionCode +
    // requisitionId so a recruiter can see exactly WHICH seats are theirs
    // (not just a count) — see the "My Assigned Positions" list below.
    const positionRows = recruiterIds.length
      ? await prisma.$queryRaw<{ id: string; recruiterId: string; requisitionId: string; positionCode: string; createdAt: Date; assignedAt: Date | null; filledAt: Date | null; status: string; slaRevisionCount: number; slaExtensionDays: number; slaRevisionReason: string | null; filledByApplicationId: string | null }[]>`
          SELECT id, "recruiterId", "requisitionId", "positionCode", "createdAt", "assignedAt", "filledAt", status, "slaRevisionCount", "slaExtensionDays", "slaRevisionReason", "filledByApplicationId" FROM "app_quikhrms"."RequisitionPosition"
          WHERE "orgId" = ${orgId} AND "recruiterId" IN (${Prisma.join(recruiterIds)}) AND "deletedAt" IS NULL
          ORDER BY "sequenceNo" ASC`
      : [];
    const positionsByRecruiter = new Map<string, typeof positionRows>();
    // Earliest position-assignment date per (requisition, recruiter) — starts
    // that recruiter's Position → Offer TAT clock on that requisition.
    const assignedAtByReqAndRecruiter = new Map<string, Date>();
    for (const p of positionRows) {
      if (!positionsByRecruiter.has(p.recruiterId)) positionsByRecruiter.set(p.recruiterId, []);
      positionsByRecruiter.get(p.recruiterId)!.push(p);
      if (p.assignedAt) {
        const key = `${p.requisitionId}::${p.recruiterId}`;
        const cur = assignedAtByReqAndRecruiter.get(key);
        if (!cur || p.assignedAt < cur) assignedAtByReqAndRecruiter.set(key, p.assignedAt);
      }
    }

    // Escalations — SLA-breach notifications the recruit-sla-check cron already
    // fires to each assigned recruiter (see cron/recruit-sla-check/route.ts).
    const escalationNotifs = recruiterIds.length
      ? await prisma.hrmsNotification.findMany({
          where: { orgId, employeeId: { in: recruiterIds }, entityType: "JobRequisition", title: { in: ["SLA breached", "SLA breach escalation"] } },
          select: { employeeId: true },
        })
      : [];
    const escalationsByRecruiter = new Map<string, number>();
    for (const n of escalationNotifs) escalationsByRecruiter.set(n.employeeId, (escalationsByRecruiter.get(n.employeeId) ?? 0) + 1);

    // Date Revisions — how often "Revise Date" was used on requisitions this
    // recruiter is on (same audit-log signal as requisitions/:id/date-history).
    const dateRevisionLogs = requisitionIds.length
      ? await prisma.hrmsAuditLog.findMany({
          where: { orgId, entityType: "Requisition", entityId: { in: requisitionIds }, action: "Update" },
          select: { entityId: true, changes: true },
        })
      : [];
    const dateRevisionsByReq = new Map<string, number>();
    for (const l of dateRevisionLogs) {
      const c = l.changes as unknown as Record<string, unknown> | null;
      if (!l.entityId || !c || (!("closedDate" in c) && !("targetJoiningDate" in c))) continue;
      dateRevisionsByReq.set(l.entityId, (dateRevisionsByReq.get(l.entityId) ?? 0) + 1);
    }
    const applications = requisitionIds.length
      ? await prisma.jobApplication.findMany({
          where: { orgId, deletedAt: null, requisitionId: { in: requisitionIds } },
          select: {
            id: true, requisitionId: true, candidateId: true, status: true, currentStage: true, appliedDate: true,
            offerStatus: true, offerSentAt: true, offerRespondedAt: true, offerJoiningDate: true, offerExpiresAt: true,
            offerDeclineReason: true, rejectionReason: true, parkedReason: true,
            updatedAt: true, hiredAt: true, stageHistory: true,
            candidate: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const applicationIds = applications.map((a) => a.id);

    // Performance-Score inputs: real per-candidate recruiter attribution
    // (assignedRecruiterId/At), not the requisition-primary-recruiter
    // fallback the OTHER metrics above use — assignedRecruiterId/At aren't in
    // the generated Prisma client yet, so raw SQL.
    const assignedRows = applicationIds.length
      ? await prisma.$queryRaw<{ id: string; assignedRecruiterId: string | null; assignedRecruiterAt: Date | null }[]>`
          SELECT id, "assignedRecruiterId", "assignedRecruiterAt" FROM "app_quikhrms"."JobApplication"
          WHERE id IN (${Prisma.join(applicationIds)})`
      : [];
    const assignedInfoByApp = new Map(assignedRows.map((r) => [r.id, { recruiterId: r.assignedRecruiterId, assignedAt: r.assignedRecruiterAt }]));
    const interviews = applicationIds.length
      ? await prisma.interview.findMany({
          where: { orgId, deletedAt: null, applicationId: { in: applicationIds }, scheduledAt: { gte: weekStart, lt: weekEnd } },
          select: { id: true, applicationId: true, scheduledAt: true, type: true, round: true },
        })
      : [];
    // Every interview (not just this week) — the EARLIEST one per application
    // is the Sourced → Interview TAT's completion date.
    const allInterviews = applicationIds.length
      ? await prisma.interview.findMany({
          where: { orgId, deletedAt: null, applicationId: { in: applicationIds } },
          select: { applicationId: true, scheduledAt: true },
        })
      : [];
    const earliestInterviewByApp = new Map<string, Date>();
    for (const iv of allInterviews) {
      const cur = earliestInterviewByApp.get(iv.applicationId);
      if (!cur || iv.scheduledAt < cur) earliestInterviewByApp.set(iv.applicationId, iv.scheduledAt);
    }
    const appById = new Map(applications.map((a) => [a.id, a]));

    // Map every application to the recruiter actually responsible for it —
    // its own assignedRecruiterId (Round Robin / self-assign / manual pick,
    // stamped at link time) when it has one, since that's the precise
    // per-candidate attribution the Assigned Positions view already uses.
    // Falls back to the requisition's primary recruiter split only for the
    // rare case an application has no assignedRecruiterId at all (e.g. no
    // recruiter had an open seat yet when it was linked).
    const recruiterOfApp = new Map<string, string | null>();
    for (const a of applications) {
      const assigned = assignedInfoByApp.get(a.id)?.recruiterId ?? null;
      recruiterOfApp.set(a.id, assigned ?? primaryByReq.get(a.requisitionId) ?? null);
    }

    async function buildRow(employeeId: string): Promise<RecruiterRow> {
      const myReqs = requisitions.filter((r) => (splitsByReq.get(r.id) ?? []).some((s) => s.employeeId === employeeId));
      const myOpenReqs = myReqs.filter((r) => OPEN_STATUSES.has(r.status));
      const myAppIds = applications.filter((a) => recruiterOfApp.get(a.id) === employeeId).map((a) => a.id);
      const myApps = myAppIds.map((id) => appById.get(id)!).filter(Boolean);

      const positionsAssigned = myReqs.reduce((sum, r) => {
        const mine = (splitsByReq.get(r.id) ?? []).find((s) => s.employeeId === employeeId);
        return sum + (mine?.positionsAssigned ?? 0);
      }, 0);

      const activeCandidates = myApps.filter((a) => ACTIVE_APP_STATUSES.has(a.status)).length;
      const myInterviewsThisWeek = interviews.filter((iv) => myAppIds.includes(iv.applicationId));
      const interviewsThisWeek = myInterviewsThisWeek.length;
      const interviewsThisWeekList = myInterviewsThisWeek.map((iv) => {
        const app = appById.get(iv.applicationId);
        return {
          id: iv.id, candidateId: app?.candidateId ?? "",
          name: app ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : "Unknown",
          requisitionTitle: app ? (reqById.get(app.requisitionId)?.title ?? "Unknown") : "Unknown",
          type: iv.type, round: iv.round, stageName: prettyStage(roundToStageName(iv.round)), scheduledAt: iv.scheduledAt,
        };
      });
      const myOffersThisWeek = myApps.filter((a) => a.offerStatus && a.offerSentAt && a.offerSentAt >= weekStart && a.offerSentAt < weekEnd);
      const offersSentThisWeek = myOffersThisWeek.length;
      const offersSentThisWeekList = myOffersThisWeek.map((a) => ({
        id: a.id, candidateId: a.candidateId,
        name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
        requisitionTitle: reqById.get(a.requisitionId)?.title ?? "Unknown",
        offerStatus: a.offerStatus, offerSentAt: a.offerSentAt,
      }));
      const hiresThisMonth = myApps.filter((a) => a.status === "AppHired" && a.hiredAt && a.hiredAt >= monthStart).length;

      // Time-to-Fill: closed requisitions, Requisition created → actually
      // closed (actualClosedAt — never the editable "Timeline to Close"
      // target, so revising that target doesn't skew an already-closed req),
      // in business days (weekends + org holidays excluded).
      const filledReqs = myReqs.filter((r) => r.status === "ReqClosed" && r.actualClosedAt);
      const fillDays = filledReqs.map((r) => countBusinessDays(r.createdAt, r.actualClosedAt!, holidayDates));
      const avgTimeToFillDays = fillDays.length ? Math.round(fillDays.reduce((s, d) => s + d, 0) / fillDays.length) : null;
      const medianTimeToFillDays = median(fillDays);

      // Time-to-Hire: hired applications, Applied → Hired (hiredAt — stamped
      // once on the AppHired transition, never moved by later unrelated edits),
      // in business days.
      const hiredApps = myApps.filter((a) => a.status === "AppHired" && a.hiredAt);
      const hireDays = hiredApps.map((a) => countBusinessDays(a.appliedDate, a.hiredAt!, holidayDates));
      const avgTimeToHireDays = hireDays.length ? Math.round(hireDays.reduce((s, d) => s + d, 0) / hireDays.length) : null;
      const medianTimeToHireDays = median(hireDays);

      // Multi-Stage TAT — Position Assigned → Offer Release, per in-flight
      // application (skips dead ends that never reached an offer and aren't
      // active anymore — nothing to rate).
      let positionToOfferInTat = 0, positionToOfferAtRisk = 0, positionToOfferMissed = 0;
      let sourcedToInterviewInTat = 0, sourcedToInterviewAtRisk = 0, sourcedToInterviewMissed = 0;
      for (const a of myApps) {
        const req = reqById.get(a.requisitionId);
        const jobLevelId = req?.jobLevelId ?? null;

        if (a.offerSentAt || ACTIVE_APP_STATUSES.has(a.status)) {
          const assignedAt = assignedAtByReqAndRecruiter.get(`${a.requisitionId}::${employeeId}`) ?? null;
          const posOfferSla = jobLevelId ? positionToOfferSlaByLevel.get(jobLevelId) ?? null : null;
          const result = computeStageTat(assignedAt, a.offerSentAt, posOfferSla, now);
          if (result.status === "IN_TAT") positionToOfferInTat++;
          else if (result.status === "AT_RISK") positionToOfferAtRisk++;
          else if (result.status === "MISSED") positionToOfferMissed++;
        }

        const firstInterview = earliestInterviewByApp.get(a.id) ?? null;
        if (firstInterview || ACTIVE_APP_STATUSES.has(a.status)) {
          const sourcedSla = jobLevelId ? sourcedToInterviewSlaByLevel.get(jobLevelId) ?? null : null;
          const result = computeStageTat(a.appliedDate, firstInterview, sourcedSla, now);
          if (result.status === "IN_TAT") sourcedToInterviewInTat++;
          else if (result.status === "AT_RISK") sourcedToInterviewAtRisk++;
          else if (result.status === "MISSED") sourcedToInterviewMissed++;
        }
      }

      // Deadline TAT — per open requisition, using the live/current
      // targetJoiningDate+etaToFillDays (the "active" deadline — already the
      // revised one if HR has pushed it since creation).
      let deadlineOnTrack = 0, deadlineAtRisk = 0, deadlineMissed = 0, deadlineOriginalMissed = 0;
      for (const r of myOpenReqs) {
        const activeDeadline = r.targetJoiningDate ?? r.originalTargetJoiningDate;
        const activeSla = r.etaToFillDays ?? r.originalEtaToFillDays;
        if (!activeDeadline || activeSla == null) continue;
        const status = computeDeadlineStatus(activeDeadline, activeSla, now);
        if (status === "ON_TRACK") deadlineOnTrack++;
        else if (status === "AT_RISK") deadlineAtRisk++;
        else deadlineMissed++;

        const originalDeadline = r.originalTargetJoiningDate ?? r.targetJoiningDate;
        if (originalDeadline && computeOriginalDeadlineStatus(originalDeadline, now) === "MISSED") deadlineOriginalMissed++;
      }

      // Recruiter & Position Tracking (Phase 1) — positions this recruiter
      // actually closed (hired into), and how long each took, seat to hire.
      const myPositions = positionsByRecruiter.get(employeeId) ?? [];
      const filledPositions = myPositions.filter((p) => p.status === "Filled" && p.filledAt);
      const positionsClosed = filledPositions.length;
      const closeDays = filledPositions.map((p) => countBusinessDays(p.createdAt, p.filledAt!, holidayDates));
      const avgTimeToClosePositionDays = closeDays.length ? Math.round(closeDays.reduce((s, d) => s + d, 0) / closeDays.length) : null;

      const escalations = escalationsByRecruiter.get(employeeId) ?? 0;
      const dateRevisions = myReqs.reduce((sum, r) => sum + (dateRevisionsByReq.get(r.id) ?? 0), 0);

      // Per-position SLA status (Position -> Offer clock, same formula as
      // the aggregate TAT badges above) — lets the "My Assigned Positions"
      // drill-down show not just what's open/filled, but which of those are
      // actually on track vs. breached.
      const positionsList = myPositions.map((p) => {
        const jobLevelId = reqById.get(p.requisitionId)?.jobLevelId ?? null;
        const baseTarget = (jobLevelId && positionToOfferSlaByLevel.get(jobLevelId)) || DEFAULT_POSITION_TO_OFFER_SLA;
        const effectiveTarget = baseTarget + p.slaExtensionDays;
        const tat = p.status === "Cancelled" ? { status: null, aging: 0 } : computeStageTat(p.assignedAt, p.filledAt, effectiveTarget, now);
        // Display/scoring status: a revised position is ALWAYS non-compliant,
        // even once it falls back inside the pushed-out deadline — the
        // recruiter doesn't get credit for a goalpost they moved themselves.
        const slaStatus = p.slaRevisionCount > 0 ? "MISSED" : tat.status;
        // Raw/unforced status — whether THIS seat has actually crossed its
        // (already-extended, if any) deadline RIGHT NOW. This is what gates
        // the "Revise SLA" action — a once-revised position that's since
        // fallen back inside its pushed-out window has nothing left to
        // revise again yet, even though it still shows red above.
        const rawSlaStatus = tat.status;
        const daysLeft = p.assignedAt ? effectiveTarget - tat.aging : null;
        // The actual calendar date the (possibly pushed-out) deadline falls
        // on — only meaningful to show once a position's been revised, since
        // otherwise "SLA 15d" already says everything a plain countdown does.
        const revisedDeadline = p.assignedAt && p.slaRevisionCount > 0
          ? new Date(p.assignedAt.getTime() + effectiveTarget * 86_400_000).toISOString()
          : null;

        // Who's actually on this seat. A Filled position has one exact
        // answer (filledByApplicationId). An Open/PendingOnboarding one
        // doesn't — there's no per-seat link until hire — so this is the
        // count of this recruiter's active candidates on the SAME
        // requisition (an aggregate, not an exact seat match).
        const filledApp = p.filledByApplicationId ? appById.get(p.filledByApplicationId) : null;
        const filledCandidateName = filledApp ? `${filledApp.candidate.firstName} ${filledApp.candidate.lastName}`.trim() : null;
        const filledCandidateId = filledApp?.candidateId ?? null;
        const pipelineCandidates = (p.status === "Open" || p.status === "PendingOnboarding")
          ? applications
              .filter((a) => a.requisitionId === p.requisitionId
                && assignedInfoByApp.get(a.id)?.recruiterId === employeeId
                && ACTIVE_APP_STATUSES.has(a.status))
              .map((a) => ({
                id: a.id, candidateId: a.candidateId,
                name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
                currentStage: a.currentStage, appliedDate: a.appliedDate,
              }))
          : [];

        return {
          id: p.id, positionCode: p.positionCode, status: p.status,
          requisitionId: p.requisitionId,
          requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
          requisitionNumber: reqById.get(p.requisitionId)?.requisitionNumber ?? "",
          slaStatus, rawSlaStatus, daysLeft, revisedDeadline,
          slaRevisionCount: p.slaRevisionCount,
          targetDays: effectiveTarget,
          daysExtended: p.slaExtensionDays,
          filledCandidateId, filledCandidateName, pipelineCandidates,
          slaRevisionReason: p.slaRevisionReason,
          assignedAt: p.assignedAt ? p.assignedAt.toISOString() : null,
          recruiterName: nameById.get(employeeId) ?? "Unknown",
        };
      });

      // Detail lists for the clickable stat cards — this recruiter's own
      // requisitions/candidates only, never the whole org's.
      const activeRequisitionsList = myOpenReqs.map((r) => ({
        id: r.id, title: r.title, requisitionNumber: r.requisitionNumber, status: r.status,
        filledPositions: r.filledPositions, positions: r.positions,
      }));
      const activeCandidatesApps = myApps.filter((a) => ACTIVE_APP_STATUSES.has(a.status));
      const activeCandidatesList = activeCandidatesApps.map((a) => ({
        id: a.id, candidateId: a.candidateId, name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
        requisitionTitle: reqById.get(a.requisitionId)?.title ?? "Unknown",
        currentStage: a.currentStage, appliedDate: a.appliedDate,
      }));
      const hiresThisMonthApps = myApps.filter((a) => a.status === "AppHired" && a.hiredAt && a.hiredAt >= monthStart);
      const hiresThisMonthList = hiresThisMonthApps.map((a) => ({
        id: a.id, candidateId: a.candidateId, name: `${a.candidate.firstName} ${a.candidate.lastName}`.trim(),
        requisitionTitle: reqById.get(a.requisitionId)?.title ?? "Unknown",
        hiredAt: a.hiredAt,
      }));

      // ── Performance Score raw inputs (8-KPI scorecard) ──────────────────
      // Real per-candidate attribution (assignedRecruiterId/At), not the
      // requisition-primary-recruiter fallback used by the metrics above.
      const myAssignedApps = applications.filter((a) => assignedInfoByApp.get(a.id)?.recruiterId === employeeId);
      const hireTargetFor = (a: (typeof myAssignedApps)[number]) => {
        const lvl = reqById.get(a.requisitionId)?.jobLevelId ?? null;
        return (lvl && slaDaysByLevel.get(lvl)) || DEFAULT_POSITION_TO_OFFER_SLA * 2;
      };
      const nameOf = (a: (typeof myAssignedApps)[number]) => `${a.candidate.firstName} ${a.candidate.lastName}`.trim();
      const reqTitleOf = (a: (typeof myAssignedApps)[number]) => reqById.get(a.requisitionId)?.title ?? "Unknown";
      const avg = (nums: number[]) => nums.reduce((s, v) => s + v, 0) / nums.length;

      // 1. Time to Offer — deadline-discipline, not a day-count: this org's
      // process is "a missed Position→Offer deadline ALWAYS gets revised"
      // (see the Revise SLA flow), so slaRevisionCount is a direct, reliable
      // proxy for "how many times this seat missed its offer deadline".
      // Scored PER POSITION (not per candidate): 0 revisions → 100,
      // 1 → 50, 2+ → 0 — then averaged across this recruiter's own seats.
      const timeToOfferScores: number[] = [];
      const timeToOfferExplain: ExplainItem[] = [];
      for (const p of myPositions) {
        if (!p.assignedAt || p.status === "Cancelled") continue;
        const positionScore = p.slaRevisionCount === 0 ? 100 : p.slaRevisionCount === 1 ? 50 : 0;
        timeToOfferScores.push(positionScore);
        timeToOfferExplain.push({
          label: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
          outcome: p.slaRevisionCount === 0 ? "No Revision" : p.slaRevisionCount === 1 ? "Revised Once" : "Revised 2+ Times",
          detail: `${p.slaRevisionCount} revision${p.slaRevisionCount === 1 ? "" : "s"} · score ${positionScore}`,
        });
      }

      // 2. Time to Hire — candidate SOURCED date → hired/onboarded date,
      // ratio against the level's overall SLA days (position-to-fill).
      const timeToHireRatios: number[] = [];
      const timeToHireExplain: ExplainItem[] = [];
      for (const a of myAssignedApps) {
        if (a.status !== "AppHired" || !a.hiredAt) continue;
        const target = hireTargetFor(a);
        const actualDays = daysBetween(a.appliedDate, a.hiredAt);
        const ratio = actualDays / target;
        timeToHireRatios.push(ratio);
        timeToHireExplain.push({ label: nameOf(a), requisitionTitle: reqTitleOf(a), outcome: ratio <= 1 ? "On Time" : "Late", detail: `${Math.round(actualDays)}d actual / ${target}d target (${ratio.toFixed(2)}×)` });
      }

      // 3. SLA Compliance — average Pipeline Target achievement (existing
      // daily-throughput benchmark, see lib/recruit/pipeline-targets.ts)
      // across every stage/level this recruiter actually had activity in
      // this month, month-to-date. Levels/stages they never touched aren't
      // averaged in as a phantom 0%.
      const pipelineReport = await computePipelineTargetActuals(orgId, { from: monthStart, to: now, recruiterId: employeeId });
      const relevantPipelineRows = pipelineReport.rows.filter((r) => r.achievementPct != null && r.actual > 0);
      const slaComplianceValue = relevantPipelineRows.length
        ? avg(relevantPipelineRows.map((r) => Math.min(100, r.achievementPct!)))
        : null;
      const slaComplianceExplain: ExplainItem[] = relevantPipelineRows.map((r) => ({
        label: `${r.levelCode} · ${prettyStage(r.stage)}`, requisitionTitle: "—",
        outcome: (r.achievementPct ?? 0) >= 100 ? "On Target" : "Below Target",
        detail: `${r.actual}/${r.totalTarget} this month (${r.achievementPct}%)`,
      }));

      // 4. Interview → Offer
      const interviewedAssignedApps = myAssignedApps.filter((a) => earliestInterviewByApp.has(a.id));
      const offeredAfterInterview = interviewedAssignedApps.filter((a) => !!a.offerSentAt).length;
      const interviewToOfferExplain: ExplainItem[] = interviewedAssignedApps.map((a) => ({
        label: nameOf(a), requisitionTitle: reqTitleOf(a),
        outcome: a.offerSentAt ? "Got Offer" : "No Offer Yet",
        detail: a.offerSentAt ? "Offer sent after interview" : (a.status === "AppRejected" ? "Rejected after interview" : "Still in process"),
      }));

      // 5. Offer Acceptance Rate — Offers Accepted ÷ Offers Released, only
      // counting offers whose outcome is actually knowable yet (decided, or
      // past its response deadline) — a still-pending offer isn't a miss.
      const offeredApps = myAssignedApps.filter((a) => !!a.offerSentAt);
      const matureOffers = offeredApps.filter((a) => !!a.offerRespondedAt
        || ["OfferAccepted", "OfferDeclined", "OfferRevoked", "OfferExpired"].includes(a.offerStatus ?? "")
        || (a.offerExpiresAt && a.offerExpiresAt < now));
      const acceptedOffers = matureOffers.filter((a) => a.offerStatus === "OfferAccepted");
      const offerAcceptanceExplain: ExplainItem[] = matureOffers.map((a) => ({
        label: nameOf(a), requisitionTitle: reqTitleOf(a),
        outcome: a.offerStatus === "OfferAccepted" ? "Accepted" : "Not Accepted",
        detail: a.offerStatus === "OfferAccepted" ? "Offer accepted" : (a.offerDeclineReason ?? a.offerStatus ?? "Not accepted"),
      }));

      // 6. Offer → Joining Ratio — of ACCEPTED offers, how many actually
      // joined (hiredAt) vs. dropped out before/at joining. "Mature" here =
      // already joined, or their target joining date has passed without it.
      const matureForJoining = acceptedOffers.filter((a) => a.status === "AppHired"
        || (a.offerJoiningDate && a.offerJoiningDate < now)
        || a.status === "AppRejected" || a.status === "AppWithdrawn");
      const joinedFromAccepted = matureForJoining.filter((a) => a.status === "AppHired" && a.hiredAt).length;
      const offerToJoiningExplain: ExplainItem[] = matureForJoining.map((a) => ({
        label: nameOf(a), requisitionTitle: reqTitleOf(a),
        outcome: a.status === "AppHired" ? "Joined" : "Did Not Join",
        detail: a.status === "AppHired" ? "Onboarding complete" : (a.rejectionReason ?? "Dropped before joining"),
      }));

      // 7. Position Closure Rate — of the seats actually allocated to this
      // recruiter (positionsAssigned, computed above), how many they closed.
      const positionClosureExplain: ExplainItem[] = myPositions.filter((p) => p.status === "Filled").map((p) => ({
        label: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
        outcome: "Closed", detail: p.filledAt ? `Filled ${p.filledAt.toISOString().slice(0, 10)}` : "Filled",
      }));

      // 8. Recruitment Process Compliance — mandatory-reason checks on
      // records where a reason is expected, PLUS: every assigned seat that
      // was never SLA-revised (a revision means the deadline was pushed out
      // to hide a breach — that costs points even if later filled inside
      // the pushed-out window).
      const needsRejectionReason = myAssignedApps.filter((a) => a.status === "AppRejected");
      const needsDeclineReason = myAssignedApps.filter((a) => a.offerStatus === "OfferDeclined");
      const needsParkedReason = myAssignedApps.filter((a) => a.status === "AppParked");
      const assignedPositions = myPositions.filter((p) => !!p.assignedAt);
      const complianceTotal = needsRejectionReason.length + needsDeclineReason.length + needsParkedReason.length + assignedPositions.length;
      const compliancePassed = needsRejectionReason.filter((a) => !!a.rejectionReason).length
        + needsDeclineReason.filter((a) => !!a.offerDeclineReason).length
        + needsParkedReason.filter((a) => !!a.parkedReason).length
        + assignedPositions.filter((p) => p.slaRevisionCount === 0).length;
      const processComplianceExplain: ExplainItem[] = [
        ...needsRejectionReason.map((a) => ({ label: nameOf(a), requisitionTitle: reqTitleOf(a), outcome: a.rejectionReason ? "Reason Given" : "Missing Reason", detail: a.rejectionReason ?? "Rejected without a reason logged" })),
        ...needsDeclineReason.map((a) => ({ label: nameOf(a), requisitionTitle: reqTitleOf(a), outcome: a.offerDeclineReason ? "Reason Given" : "Missing Reason", detail: a.offerDeclineReason ?? "Declined without a reason logged" })),
        ...needsParkedReason.map((a) => ({ label: nameOf(a), requisitionTitle: reqTitleOf(a), outcome: a.parkedReason ? "Reason Given" : "Missing Reason", detail: a.parkedReason ?? "Parked without a reason logged" })),
        ...assignedPositions.map((p) => ({ label: p.positionCode, requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown", outcome: p.slaRevisionCount === 0 ? "No SLA Revision" : "SLA Revised", detail: p.slaRevisionCount === 0 ? "Deadline never pushed out" : `Revised ${p.slaRevisionCount}×` })),
      ];

      const scoreInputs: KpiInput[] = [
        { code: "TIME_TO_OFFER", value: timeToOfferScores.length ? avg(timeToOfferScores) : null, sampleSize: timeToOfferScores.length },
        { code: "TIME_TO_HIRE", value: timeToHireRatios.length ? avg(timeToHireRatios) : null, sampleSize: timeToHireRatios.length },
        { code: "SLA_COMPLIANCE", value: slaComplianceValue, sampleSize: relevantPipelineRows.length },
        { code: "INTERVIEW_TO_OFFER", value: interviewedAssignedApps.length ? (offeredAfterInterview / interviewedAssignedApps.length) * 100 : null, sampleSize: interviewedAssignedApps.length },
        { code: "OFFER_ACCEPTANCE", value: matureOffers.length ? (acceptedOffers.length / matureOffers.length) * 100 : null, sampleSize: matureOffers.length },
        { code: "OFFER_TO_JOINING", value: matureForJoining.length ? (joinedFromAccepted / matureForJoining.length) * 100 : null, sampleSize: matureForJoining.length },
        { code: "POSITION_CLOSURE", value: positionsAssigned ? (positionsClosed / positionsAssigned) * 100 : null, sampleSize: positionsAssigned },
        { code: "PROCESS_COMPLIANCE", value: complianceTotal ? (compliancePassed / complianceTotal) * 100 : null, sampleSize: complianceTotal },
      ];

      const scoreExplain: Record<string, ExplainItem[]> = {
        TIME_TO_OFFER: timeToOfferExplain, TIME_TO_HIRE: timeToHireExplain, SLA_COMPLIANCE: slaComplianceExplain,
        INTERVIEW_TO_OFFER: interviewToOfferExplain, OFFER_ACCEPTANCE: offerAcceptanceExplain,
        OFFER_TO_JOINING: offerToJoiningExplain, POSITION_CLOSURE: positionClosureExplain, PROCESS_COMPLIANCE: processComplianceExplain,
      };

      return {
        employeeId, name: nameById.get(employeeId) ?? "Unknown",
        activeRequisitions: myOpenReqs.length, positionsAssigned, activeCandidates,
        interviewsThisWeek, offersSentThisWeek, hiresThisMonth,
        avgTimeToFillDays, medianTimeToFillDays, avgTimeToHireDays, medianTimeToHireDays,
        positionToOfferInTat, positionToOfferAtRisk, positionToOfferMissed,
        sourcedToInterviewInTat, sourcedToInterviewAtRisk, sourcedToInterviewMissed,
        deadlineOnTrack, deadlineAtRisk, deadlineMissed, deadlineOriginalMissed,
        positionsClosed, avgTimeToClosePositionDays, escalations, dateRevisions,
        score: canSeeAll ? computeRecruiterScore(scoreInputs) : undefined,
        scoreExplain: canSeeAll ? scoreExplain : undefined,
        positions: positionsList,
        activeRequisitionsList, activeCandidatesList, hiresThisMonthList,
        interviewsThisWeekList, offersSentThisWeekList,
      };
    }

    const recruiters = (await Promise.all(recruiterIds.map(buildRow))).sort((a, b) => b.activeRequisitions - a.activeRequisitions);

    // Org-wide averages — a simple peer benchmark line shown alongside each
    // recruiter's own numbers (full per-Job-Level cohort breakdown is Phase 2).
    const allFilled = requisitions.filter((r) => r.status === "ReqClosed" && r.actualClosedAt);
    const allHired = applications.filter((a) => a.status === "AppHired" && a.hiredAt);
    const allFillDays = allFilled.map((r) => countBusinessDays(r.createdAt, r.actualClosedAt!, holidayDates));
    const allHireDays = allHired.map((a) => countBusinessDays(a.appliedDate, a.hiredAt!, holidayDates));
    const orgAverage = {
      avgTimeToFillDays: allFillDays.length ? Math.round(allFillDays.reduce((s, d) => s + d, 0) / allFillDays.length) : null,
      medianTimeToFillDays: median(allFillDays),
      avgTimeToHireDays: allHireDays.length ? Math.round(allHireDays.reduce((s, d) => s + d, 0) / allHireDays.length) : null,
      medianTimeToHireDays: median(allHireDays),
    };

    // Recruitment Funnel — cumulative "ever reached this stage" counts (not
    // "currently sitting at" — a candidate now at Offer has ALSO reached
    // every earlier stage), across whatever's in scope. Each stage carries
    // both its own conversion (from the immediately-preceding stage) and its
    // overall conversion (from the funnel's first stage), per the source
    // spec — a stage% near 100 with a falling overall% just means the leak
    // happened earlier, not here.
    const inScopeAppIds = new Set(applications.filter((a) => recruiterIds.includes(recruiterOfApp.get(a.id) ?? "")).map((a) => a.id));
    const reachedCounts = new Map<string, number>();
    for (const a of applications) {
      if (!inScopeAppIds.has(a.id)) continue;
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

    // Stage-level TAT (turn-around-time) — average days spent IN each stage,
    // computed from stageHistory's own {stage, date} trail: the gap between
    // one entry and the next is exactly how long the candidate sat in the
    // earlier entry's stage. The candidate's current (still-open) stage has
    // no "next" entry yet, so it's excluded from the average on purpose —
    // it hasn't finished, averaging it in would understate real TAT.
    const stageDurations = new Map<string, number[]>();
    for (const a of applications) {
      if (!inScopeAppIds.has(a.id)) continue;
      const history = Array.isArray(a.stageHistory) ? (a.stageHistory as unknown[]) : [];
      const points = history
        .map((h) => (h && typeof h === "object" ? h as { stage?: unknown; date?: unknown } : null))
        .filter((h): h is { stage: string; date: string } => !!h && typeof h.stage === "string" && typeof h.date === "string")
        .map((h) => ({ stage: h.stage, at: new Date(h.date) }))
        .sort((x, y) => x.at.getTime() - y.at.getTime());
      for (let i = 0; i < points.length - 1; i++) {
        const days = countBusinessDays(points[i].at, points[i + 1].at, holidayDates);
        if (!stageDurations.has(points[i].stage)) stageDurations.set(points[i].stage, []);
        stageDurations.get(points[i].stage)!.push(days);
      }
    }
    const stageTat = [...stageDurations.entries()]
      .map(([stage, days]) => ({
        stage,
        avgDays: Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10,
        count: days.length,
      }))
      .sort((a, b) => b.avgDays - a.avgDays);

    // Monthly trends — last 6 calendar months (oldest → newest), scoped to
    // whatever's in scope (all recruiters, or the filtered one). Only metrics
    // with a real stored event timestamp can be shown retrospectively —
    // hires (hiredAt) and closures/Time-to-Fill (actualClosedAt). SLA
    // compliance can't be reconstructed for past months since it's a
    // point-in-time snapshot, not an event with a timestamp.
    const inScopeReqIds = new Set(requisitions.filter((r) => (splitsByReq.get(r.id) ?? []).some((s) => recruiterIds.includes(s.employeeId))).map((r) => r.id));
    const monthlyTrends: { month: string; hires: number; closedRequisitions: number; avgTimeToFillDays: number | null }[] = [];
    for (let i = 5; i >= 0; i--) {
      const bucketStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const bucketEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthLabel = bucketStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });

      const hires = applications.filter((a) => inScopeAppIds.has(a.id) && a.hiredAt && a.hiredAt >= bucketStart && a.hiredAt < bucketEnd).length;
      const closedInBucket = requisitions.filter((r) => inScopeReqIds.has(r.id) && r.status === "ReqClosed" && r.actualClosedAt && r.actualClosedAt >= bucketStart && r.actualClosedAt < bucketEnd);
      const closedFillDays = closedInBucket.map((r) => countBusinessDays(r.createdAt, r.actualClosedAt!, holidayDates));
      monthlyTrends.push({
        month: monthLabel,
        hires,
        closedRequisitions: closedInBucket.length,
        avgTimeToFillDays: closedFillDays.length ? Math.round(closedFillDays.reduce((s, d) => s + d, 0) / closedFillDays.length) : null,
      });
    }

    // Open requisitions by department — for the "Requisitions by Department"
    // widget, scoped the same way as the funnel/stage-TAT above (whatever
    // recruiter(s) are currently in scope).
    const deptCounts = new Map<string, number>();
    for (const r of requisitions) {
      if (!inScopeReqIds.has(r.id) || !OPEN_STATUSES.has(r.status)) continue;
      const dept = departmentByReq.get(r.id) ?? "Unassigned";
      deptCounts.set(dept, (deptCounts.get(dept) ?? 0) + 1);
    }
    const departmentBreakdown = [...deptCounts.entries()]
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    // KPI-tile trend deltas — week-over-week for Open Requisitions / Active
    // Candidates, month-over-month for Hires, same "in scope" recruiter set
    // as the funnel/stage-TAT aggregates above. A null pct means there's no
    // prior-period baseline to compare against (not "0% change").
    const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pctChange = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr > 0 ? 100 : null;
      return Math.round(((curr - prev) / prev) * 100);
    };

    const reqsThisWeek = requisitions.filter((r) => inScopeReqIds.has(r.id) && r.createdAt >= weekStart && r.createdAt < weekEnd).length;
    const reqsPrevWeek = requisitions.filter((r) => inScopeReqIds.has(r.id) && r.createdAt >= prevWeekStart && r.createdAt < weekStart).length;

    const candidatesThisWeek = applications.filter((a) => inScopeAppIds.has(a.id) && a.appliedDate >= weekStart && a.appliedDate < weekEnd).length;
    const candidatesPrevWeek = applications.filter((a) => inScopeAppIds.has(a.id) && a.appliedDate >= prevWeekStart && a.appliedDate < weekStart).length;

    const hiresThisMonthTotal = applications.filter((a) => inScopeAppIds.has(a.id) && a.status === "AppHired" && a.hiredAt && a.hiredAt >= monthStart).length;
    const hiresLastMonthTotal = applications.filter((a) => inScopeAppIds.has(a.id) && a.status === "AppHired" && a.hiredAt && a.hiredAt >= prevMonthStart && a.hiredAt < monthStart).length;

    const offersMadeThisMonth = applications.filter((a) => inScopeAppIds.has(a.id) && a.offerSentAt && a.offerSentAt >= monthStart).length;
    const offersMadeLastMonth = applications.filter((a) => inScopeAppIds.has(a.id) && a.offerSentAt && a.offerSentAt >= prevMonthStart && a.offerSentAt < monthStart).length;

    const positionsFilledThisMonth = positionRows.filter((p) => p.status === "Filled" && p.filledAt && p.filledAt >= monthStart).length;
    const positionsFilledLastMonth = positionRows.filter((p) => p.status === "Filled" && p.filledAt && p.filledAt >= prevMonthStart && p.filledAt < monthStart).length;

    // Time-to-Fill's trend is read straight off the last two monthlyTrends
    // buckets already built above — no extra query needed. Lower is better
    // for this one, so the caller inverts the arrow color, not the sign.
    const thisMonthTTF = monthlyTrends[monthlyTrends.length - 1]?.avgTimeToFillDays ?? null;
    const lastMonthTTF = monthlyTrends[monthlyTrends.length - 2]?.avgTimeToFillDays ?? null;

    const kpiTrends = {
      newRequisitionsThisWeek: reqsThisWeek,
      requisitionsWowPct: pctChange(reqsThisWeek, reqsPrevWeek),
      newCandidatesThisWeek: candidatesThisWeek,
      candidatesWowPct: pctChange(candidatesThisWeek, candidatesPrevWeek),
      hiresThisMonthTotal, hiresLastMonthTotal,
      hiresMomPct: pctChange(hiresThisMonthTotal, hiresLastMonthTotal),
      offersMadeThisMonth, offersMadeLastMonth,
      offersMadeMomPct: pctChange(offersMadeThisMonth, offersMadeLastMonth),
      positionsFilledThisMonth, positionsFilledLastMonth,
      positionsFilledMomPct: pctChange(positionsFilledThisMonth, positionsFilledLastMonth),
      avgTimeToFillMomPct: thisMonthTTF != null && lastMonthTTF != null ? pctChange(thisMonthTTF, lastMonthTTF) : null,
    };

    return successResponse({ recruiters, orgAverage, funnel, stageTat, monthlyTrends, departmentBreakdown, kpiTrends, scope: canSeeAll ? "all" : "self" });
  } catch (error) {
    console.error("GET /recruit/recruiter-performance error:", error);
    return internalError();
  }
});
