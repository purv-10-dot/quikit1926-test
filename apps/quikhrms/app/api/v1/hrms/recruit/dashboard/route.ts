import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/recruit/dashboard
 * Recruitment overview: KPIs, pipeline funnel, offer/time-to-hire stats,
 * open-requisition aging, recruiter workload, and a recent-activity feed.
 */

const DEFAULT_STAGES = ["Screening", "PhoneScreen", "TechnicalInterview", "ManagerInterview", "HRInterview", "Offer", "Hired"];
const prettyStage = (s: string) => (s === "HRInterview" ? "HR Interview" : s.replace(/([A-Z])/g, " $1").trim());

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    // Current week, Monday–Sunday.
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((now.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const activeWhere = {
      orgId, deletedAt: null, status: "AppActive" as const,
      candidate: { isBlacklisted: false, isArchived: false },
    };

    const [
      openReqCount, openReqs, inPipeline, stageGroups, reqCounts,
      interviewsThisWeek, offersOut, offersSentMTD, offersAcceptedMTD, offersDeclinedMTD,
      hiresMTD, hiredApps,
      recentOfferApps, upcomingInterviews,
    ] = await Promise.all([
      prisma.jobRequisition.count({ where: { orgId, deletedAt: null, status: "ReqOpen" } }),
      prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null, status: "ReqOpen" },
        select: { id: true, title: true, requisitionNumber: true, createdAt: true, positions: true, filledPositions: true, recruiterId: true, etaToFillDays: true },
        orderBy: { createdAt: "asc" },
        take: 10,
      }),
      prisma.jobApplication.count({ where: activeWhere }),
      prisma.jobApplication.groupBy({ by: ["currentStage"], where: activeWhere, _count: { _all: true } }),
      prisma.jobApplication.groupBy({ by: ["requisitionId"], where: activeWhere, _count: { _all: true } }),
      prisma.interview.count({ where: { orgId, scheduledAt: { gte: weekStart, lt: weekEnd }, status: { in: ["IntScheduled", "IntRescheduled"] } } }),
      prisma.jobApplication.count({ where: { orgId, deletedAt: null, offerStatus: "OfferSent" } }),
      prisma.jobApplication.count({ where: { orgId, deletedAt: null, offerSentAt: { gte: monthStart } } }),
      prisma.jobApplication.count({ where: { orgId, deletedAt: null, offerStatus: "OfferAccepted", offerRespondedAt: { gte: monthStart } } }),
      prisma.jobApplication.count({ where: { orgId, deletedAt: null, offerStatus: "OfferDeclined", offerRespondedAt: { gte: monthStart } } }),
      prisma.jobApplication.count({ where: { orgId, deletedAt: null, status: "AppHired", updatedAt: { gte: monthStart } } }),
      prisma.jobApplication.findMany({ where: { orgId, deletedAt: null, status: "AppHired" }, select: { appliedDate: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.jobApplication.findMany({
        where: { orgId, deletedAt: null, offerSentAt: { not: null } },
        select: { id: true, offerStatus: true, offerSentAt: true, offerRespondedAt: true, candidate: { select: { firstName: true, lastName: true } }, requisition: { select: { title: true } } },
        orderBy: { offerSentAt: "desc" }, take: 5,
      }),
      prisma.interview.findMany({
        where: { orgId, scheduledAt: { gte: now }, status: { in: ["IntScheduled", "IntRescheduled"] } },
        select: { id: true, scheduledAt: true, type: true, round: true, application: { select: { candidate: { select: { firstName: true, lastName: true } } } } },
        orderBy: { scheduledAt: "asc" }, take: 5,
      }),
    ]);

    // ── Funnel: active candidates per stage (default order + any extra stages) ──
    const stageCount = new Map<string, number>();
    for (const g of stageGroups) if (g.currentStage) stageCount.set(g.currentStage, g._count._all);
    const extraStages = [...stageCount.keys()].filter((s) => !DEFAULT_STAGES.includes(s));
    const funnel = [...DEFAULT_STAGES, ...extraStages].map((name) => ({ stage: name, label: prettyStage(name), count: stageCount.get(name) ?? 0 }));

    // ── Time-to-hire (avg days appliedDate → hired) ──
    const durations = hiredApps
      .map((a) => (a.updatedAt.getTime() - new Date(a.appliedDate).getTime()) / 86_400_000)
      .filter((d) => d >= 0);
    const avgTimeToHire = durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0;

    const decidedMTD = offersAcceptedMTD + offersDeclinedMTD;
    const acceptanceRate = decidedMTD ? Math.round((offersAcceptedMTD / decidedMTD) * 100) : 0;

    // ── Candidate counts per requisition (for aging + recruiter workload) ──
    const cntByReq = new Map(reqCounts.map((r) => [r.requisitionId, r._count._all]));

    // Resolve recruiter names (union of open-req recruiters + those with active apps).
    const reqIds = reqCounts.map((r) => r.requisitionId);
    const reqRecs = reqIds.length
      ? await prisma.jobRequisition.findMany({ where: { orgId, id: { in: reqIds } }, select: { id: true, recruiterId: true } })
      : [];
    const recByReq = new Map(reqRecs.map((r) => [r.id, r.recruiterId]));
    const perRecruiter = new Map<string, number>();
    for (const rc of reqCounts) {
      const rec = recByReq.get(rc.requisitionId);
      if (rec) perRecruiter.set(rec, (perRecruiter.get(rec) ?? 0) + rc._count._all);
    }
    const recruiterIds = [...new Set([...perRecruiter.keys(), ...openReqs.map((r) => r.recruiterId).filter((x): x is string => !!x)])];
    const emps = recruiterIds.length
      ? await prisma.employee.findMany({ where: { orgId, id: { in: recruiterIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const empName = new Map(emps.map((e) => [e.id, `${e.firstName} ${e.lastName}`.trim()]));

    // ── Open requisitions & aging ──
    const openReqAging = openReqs.map((r) => {
      const ageDays = Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / 86_400_000));
      const eta = r.etaToFillDays ?? 30;
      const ratio = eta > 0 ? ageDays / eta : 0;
      const status = ratio > 1 ? "overdue" : ratio > 0.66 ? "aging" : "on-track";
      return {
        id: r.id, title: r.title, requisitionNumber: r.requisitionNumber,
        recruiter: r.recruiterId ? empName.get(r.recruiterId) ?? "—" : "—",
        candidates: cntByReq.get(r.id) ?? 0, ageDays, etaDays: eta, status,
      };
    });

    // ── Recruiter workload ──
    const recruiterWorkload = [...perRecruiter.entries()]
      .map(([id, count]) => ({ id, name: empName.get(id) ?? "Unassigned", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // ── Recent activity feed ──
    type Activity = { type: "offer-accepted" | "offer-sent" | "interview"; name: string; detail: string; at: string };
    const activity: Activity[] = [];
    for (const o of recentOfferApps) {
      const name = `${o.candidate.firstName} ${o.candidate.lastName}`.trim();
      if (o.offerStatus === "OfferAccepted" && o.offerRespondedAt) {
        activity.push({ type: "offer-accepted", name, detail: `${o.requisition.title} · offer accepted`, at: o.offerRespondedAt.toISOString() });
      } else if (o.offerSentAt) {
        activity.push({ type: "offer-sent", name, detail: `${o.requisition.title} · offer sent`, at: o.offerSentAt.toISOString() });
      }
    }
    for (const iv of upcomingInterviews) {
      const c = iv.application?.candidate;
      const name = c ? `${c.firstName} ${c.lastName}`.trim() : "Candidate";
      activity.push({ type: "interview", name, detail: `${iv.type} · round ${iv.round}`, at: iv.scheduledAt.toISOString() });
    }
    activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const openPositions = openReqs.reduce((s, r) => s + Math.max(0, r.positions - r.filledPositions), 0);

    return successResponse({
      kpis: {
        openRequisitions: openReqCount,
        openPositions,
        inPipeline,
        interviewsThisWeek,
        offersOut,
        hiresMTD,
        avgTimeToHire,
        offersSentMTD,
        offersAcceptedMTD,
        acceptanceRate,
      },
      funnel,
      openReqAging,
      recruiterWorkload,
      activity: activity.slice(0, 8),
    });
  } catch (error) {
    console.error("GET /recruit/dashboard error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read", "hrms.recruit.write"], anyPermission: true });
