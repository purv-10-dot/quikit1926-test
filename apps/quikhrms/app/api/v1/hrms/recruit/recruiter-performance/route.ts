import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { countBusinessDays, computeRequisitionSla, getHolidayDateSet, median } from "@/lib/recruit/sla";

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
  slaOnTrack: number;
  slaAging: number;
  slaOverdue: number;
  slaCompliancePct: number | null;
  // Recruiter & Position Tracking (Phase 1) additions.
  positionsClosed: number;
  avgTimeToClosePositionDays: number | null;
  escalations: number;
  dateRevisions: number;
  // Exactly which seats are allocated to this recruiter — not just a count.
  positions: { id: string; positionCode: string; status: string; requisitionTitle: string; requisitionNumber: string }[];
  // Backing detail lists for the clickable stat cards — always just THIS
  // recruiter's own items, never someone else's or the full org list.
  activeRequisitionsList: { id: string; title: string; requisitionNumber: string; status: string; filledPositions: number; positions: number }[];
  activeCandidatesList: { id: string; candidateId: string; name: string; requisitionTitle: string; currentStage: string | null; appliedDate: Date }[];
  hiresThisMonthList: { id: string; candidateId: string; name: string; requisitionTitle: string; hiredAt: Date | null }[];
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

    const [requisitions, jobLevels] = await Promise.all([
      prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null },
        select: {
          id: true, title: true, requisitionNumber: true, status: true,
          positions: true, filledPositions: true, createdAt: true, actualClosedAt: true,
          recruiterId: true, jobLevelId: true, customSlaDays: true,
          slaPausedAt: true, slaPausedDays: true,
          recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true, positionsAssigned: true } },
        },
      }),
      prisma.jobLevel.findMany({ where: { orgId, deletedAt: null }, select: { id: true, slaDays: true } }),
    ]);
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
      return successResponse({ recruiters: [], orgAverage: null, funnel: [], stageTat: [], monthlyTrends: [], scope: canSeeAll ? "all" : "self" });
    }

    const recruiterEmployees = await prisma.employee.findMany({
      where: { id: { in: recruiterIds }, orgId },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(recruiterEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    const requisitionIds = requisitions.map((r) => r.id);
    const reqById = new Map(requisitions.map((r) => [r.id, r]));

    // Recruiter & Position Tracking (Phase 1) — Positions Closed + Time to
    // Close, per recruiter. RequisitionPosition isn't in the generated Prisma
    // client yet, so it's fetched via raw SQL. Includes positionCode +
    // requisitionId so a recruiter can see exactly WHICH seats are theirs
    // (not just a count) — see the "My Assigned Positions" list below.
    const positionRows = recruiterIds.length
      ? await prisma.$queryRaw<{ id: string; recruiterId: string; requisitionId: string; positionCode: string; createdAt: Date; filledAt: Date | null; status: string }[]>`
          SELECT id, "recruiterId", "requisitionId", "positionCode", "createdAt", "filledAt", status FROM "app_quikhrms"."RequisitionPosition"
          WHERE "orgId" = ${orgId} AND "recruiterId" IN (${Prisma.join(recruiterIds)}) AND "deletedAt" IS NULL
          ORDER BY "sequenceNo" ASC`
      : [];
    const positionsByRecruiter = new Map<string, typeof positionRows>();
    for (const p of positionRows) {
      if (!positionsByRecruiter.has(p.recruiterId)) positionsByRecruiter.set(p.recruiterId, []);
      positionsByRecruiter.get(p.recruiterId)!.push(p);
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
            offerStatus: true, offerSentAt: true, updatedAt: true, hiredAt: true, stageHistory: true,
            candidate: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const applicationIds = applications.map((a) => a.id);
    const interviews = applicationIds.length
      ? await prisma.interview.findMany({
          where: { orgId, deletedAt: null, applicationId: { in: applicationIds }, scheduledAt: { gte: weekStart, lt: weekEnd } },
          select: { applicationId: true },
        })
      : [];
    const appById = new Map(applications.map((a) => [a.id, a]));

    // Map every application to the recruiter(s) responsible for it (its
    // requisition's primary recruiter — see the Phase-1 note at the top).
    const recruiterOfApp = new Map<string, string | null>();
    for (const a of applications) recruiterOfApp.set(a.id, primaryByReq.get(a.requisitionId) ?? null);

    const computeSla = (r: (typeof requisitions)[number]) => computeRequisitionSla(r, slaDaysByLevel, holidayDates, now);

    function buildRow(employeeId: string): RecruiterRow {
      const myReqs = requisitions.filter((r) => (splitsByReq.get(r.id) ?? []).some((s) => s.employeeId === employeeId));
      const myOpenReqs = myReqs.filter((r) => OPEN_STATUSES.has(r.status));
      const myAppIds = applications.filter((a) => recruiterOfApp.get(a.id) === employeeId).map((a) => a.id);
      const myApps = myAppIds.map((id) => appById.get(id)!).filter(Boolean);

      const positionsAssigned = myReqs.reduce((sum, r) => {
        const mine = (splitsByReq.get(r.id) ?? []).find((s) => s.employeeId === employeeId);
        return sum + (mine?.positionsAssigned ?? 0);
      }, 0);

      const activeCandidates = myApps.filter((a) => ACTIVE_APP_STATUSES.has(a.status)).length;
      const interviewsThisWeek = interviews.filter((iv) => myAppIds.includes(iv.applicationId)).length;
      const offersSentThisWeek = myApps.filter((a) => a.offerStatus && a.offerSentAt && a.offerSentAt >= weekStart && a.offerSentAt < weekEnd).length;
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

      let slaOnTrack = 0, slaAging = 0, slaOverdue = 0;
      for (const r of myOpenReqs) {
        const s = computeSla(r);
        if (s === "green") slaOnTrack++;
        else if (s === "amber") slaAging++;
        else if (s === "red") slaOverdue++;
      }
      const slaRated = slaOnTrack + slaAging + slaOverdue;
      const slaCompliancePct = slaRated ? Math.round(((slaOnTrack + slaAging) / slaRated) * 100) : null;

      // Recruiter & Position Tracking (Phase 1) — positions this recruiter
      // actually closed (hired into), and how long each took, seat to hire.
      const myPositions = positionsByRecruiter.get(employeeId) ?? [];
      const filledPositions = myPositions.filter((p) => p.status === "Filled" && p.filledAt);
      const positionsClosed = filledPositions.length;
      const closeDays = filledPositions.map((p) => countBusinessDays(p.createdAt, p.filledAt!, holidayDates));
      const avgTimeToClosePositionDays = closeDays.length ? Math.round(closeDays.reduce((s, d) => s + d, 0) / closeDays.length) : null;

      const escalations = escalationsByRecruiter.get(employeeId) ?? 0;
      const dateRevisions = myReqs.reduce((sum, r) => sum + (dateRevisionsByReq.get(r.id) ?? 0), 0);

      const positionsList = myPositions.map((p) => ({
        id: p.id, positionCode: p.positionCode, status: p.status,
        requisitionTitle: reqById.get(p.requisitionId)?.title ?? "Unknown",
        requisitionNumber: reqById.get(p.requisitionId)?.requisitionNumber ?? "",
      }));

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

      return {
        employeeId, name: nameById.get(employeeId) ?? "Unknown",
        activeRequisitions: myOpenReqs.length, positionsAssigned, activeCandidates,
        interviewsThisWeek, offersSentThisWeek, hiresThisMonth,
        avgTimeToFillDays, medianTimeToFillDays, avgTimeToHireDays, medianTimeToHireDays,
        slaOnTrack, slaAging, slaOverdue, slaCompliancePct,
        positionsClosed, avgTimeToClosePositionDays, escalations, dateRevisions,
        positions: positionsList,
        activeRequisitionsList, activeCandidatesList, hiresThisMonthList,
      };
    }

    const recruiters = recruiterIds.map(buildRow).sort((a, b) => b.activeRequisitions - a.activeRequisitions);

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

    // Funnel — stage counts across whatever's in scope (all applications for
    // the visible recruiter set).
    const inScopeAppIds = new Set(applications.filter((a) => recruiterIds.includes(recruiterOfApp.get(a.id) ?? "")).map((a) => a.id));
    const funnelCounts = new Map<string, number>();
    for (const a of applications) {
      if (!inScopeAppIds.has(a.id) || !a.currentStage) continue;
      funnelCounts.set(a.currentStage, (funnelCounts.get(a.currentStage) ?? 0) + 1);
    }
    const funnel = [...funnelCounts.entries()].map(([stage, count]) => ({ stage, count }));

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

    return successResponse({ recruiters, orgAverage, funnel, stageTat, monthlyTrends, scope: canSeeAll ? "all" : "self" });
  } catch (error) {
    console.error("GET /recruit/recruiter-performance error:", error);
    return internalError();
  }
});
