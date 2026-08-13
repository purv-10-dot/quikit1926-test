import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

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
function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / 86_400_000);
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
  avgTimeToHireDays: number | null;
  slaOnTrack: number;
  slaAging: number;
  slaOverdue: number;
  slaCompliancePct: number | null;
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
          positions: true, filledPositions: true, createdAt: true, closedDate: true,
          recruiterId: true, jobLevelId: true, customSlaDays: true,
          recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true, positionsAssigned: true } },
        },
      }),
      prisma.jobLevel.findMany({ where: { orgId, deletedAt: null }, select: { id: true, slaDays: true } }),
    ]);
    const slaDaysByLevel = new Map(jobLevels.map((l) => [l.id, l.slaDays]));

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
      return successResponse({ recruiters: [], orgAverage: null, funnel: [], scope: canSeeAll ? "all" : "self" });
    }

    const recruiterEmployees = await prisma.employee.findMany({
      where: { id: { in: recruiterIds }, orgId },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(recruiterEmployees.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    const requisitionIds = requisitions.map((r) => r.id);
    const applications = requisitionIds.length
      ? await prisma.jobApplication.findMany({
          where: { orgId, deletedAt: null, requisitionId: { in: requisitionIds } },
          select: {
            id: true, requisitionId: true, status: true, currentStage: true, appliedDate: true,
            offerStatus: true, offerSentAt: true, updatedAt: true,
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

    function computeSla(r: (typeof requisitions)[number]): "green" | "amber" | "red" | null {
      const slaDays = r.customSlaDays ?? (r.jobLevelId ? slaDaysByLevel.get(r.jobLevelId) : null);
      if (!slaDays) return null;
      const age = daysBetween(r.createdAt, now);
      const utilization = age / slaDays;
      return utilization <= 0.66 ? "green" : utilization <= 1 ? "amber" : "red";
    }

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
      const hiresThisMonth = myApps.filter((a) => a.status === "AppHired" && a.updatedAt >= monthStart).length;

      // Time-to-Fill: closed requisitions, Requisition created → closed.
      const filledReqs = myReqs.filter((r) => r.status === "ReqClosed" && r.closedDate);
      const avgTimeToFillDays = filledReqs.length
        ? Math.round(filledReqs.reduce((s, r) => s + daysBetween(r.createdAt, r.closedDate!), 0) / filledReqs.length)
        : null;

      // Time-to-Hire: hired applications, Applied → Hired (updatedAt proxy).
      const hiredApps = myApps.filter((a) => a.status === "AppHired");
      const avgTimeToHireDays = hiredApps.length
        ? Math.round(hiredApps.reduce((s, a) => s + daysBetween(a.appliedDate, a.updatedAt), 0) / hiredApps.length)
        : null;

      let slaOnTrack = 0, slaAging = 0, slaOverdue = 0;
      for (const r of myOpenReqs) {
        const s = computeSla(r);
        if (s === "green") slaOnTrack++;
        else if (s === "amber") slaAging++;
        else if (s === "red") slaOverdue++;
      }
      const slaRated = slaOnTrack + slaAging + slaOverdue;
      const slaCompliancePct = slaRated ? Math.round(((slaOnTrack + slaAging) / slaRated) * 100) : null;

      return {
        employeeId, name: nameById.get(employeeId) ?? "Unknown",
        activeRequisitions: myOpenReqs.length, positionsAssigned, activeCandidates,
        interviewsThisWeek, offersSentThisWeek, hiresThisMonth,
        avgTimeToFillDays, avgTimeToHireDays,
        slaOnTrack, slaAging, slaOverdue, slaCompliancePct,
      };
    }

    const recruiters = recruiterIds.map(buildRow).sort((a, b) => b.activeRequisitions - a.activeRequisitions);

    // Org-wide averages — a simple peer benchmark line shown alongside each
    // recruiter's own numbers (full per-Job-Level cohort breakdown is Phase 2).
    const allFilled = requisitions.filter((r) => r.status === "ReqClosed" && r.closedDate);
    const allHired = applications.filter((a) => a.status === "AppHired");
    const orgAverage = {
      avgTimeToFillDays: allFilled.length ? Math.round(allFilled.reduce((s, r) => s + daysBetween(r.createdAt, r.closedDate!), 0) / allFilled.length) : null,
      avgTimeToHireDays: allHired.length ? Math.round(allHired.reduce((s, a) => s + daysBetween(a.appliedDate, a.updatedAt), 0) / allHired.length) : null,
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

    return successResponse({ recruiters, orgAverage, funnel, scope: canSeeAll ? "all" : "self" });
  } catch (error) {
    console.error("GET /recruit/recruiter-performance error:", error);
    return internalError();
  }
});
