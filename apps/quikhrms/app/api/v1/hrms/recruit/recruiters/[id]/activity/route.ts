import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { groupActivityEvents, prettyStage, type RawActivityEvent } from "@/lib/recruit/activity-timeline";

/**
 * GET /api/v1/hrms/recruit/recruiters/:id/activity — "what did this recruiter
 * do, and when" across EVERY requisition they're on: requisition-level
 * events (created/edited/status/approve/reject/assigned) plus date-grouped
 * candidate activity (screened, interviewed, offered, hired) — same building
 * blocks as the per-requisition Timeline, just aggregated across requisitions.
 *
 * Scope: HR_Head-style roles (hrms.recruit.performance.read) can view any
 * recruiter; Recruiter-style roles (read_self) only ever their own.
 */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId, permissions } = ctx;
    const canSeeAll = permissions.includes("*") || permissions.includes("hrms.recruit.performance.read");
    const canSeeSelf = canSeeAll || permissions.includes("hrms.recruit.performance.read_self");
    if (!canSeeSelf) return forbidden("No recruiter-performance read permission");

    if (!canSeeAll) {
      const callerEmployeeId = await resolveEmployeeId(orgId, ctx.userId);
      if (!callerEmployeeId || callerEmployeeId !== params.id) return forbidden("You can only view your own activity");
    }

    const recruiter = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!recruiter) return notFound("Recruiter not found");

    const requisitions = await prisma.jobRequisition.findMany({
      where: {
        orgId, deletedAt: null,
        OR: [
          { recruiterId: params.id },
          { recruiterSplits: { some: { employeeId: params.id, deletedAt: null } } },
        ],
      },
      select: {
        id: true, title: true, requisitionNumber: true,
        recruiterId: true, recruiterSplits: { where: { deletedAt: null }, select: { employeeId: true } },
      },
    });
    if (requisitions.length === 0) {
      return successResponse({ recruiter: { id: recruiter.id, name: `${recruiter.firstName} ${recruiter.lastName}`.trim() }, entries: [] });
    }
    const requisitionIds = requisitions.map((r) => r.id);
    const titleById = new Map(requisitions.map((r) => [r.id, r.title]));

    // Candidate-level activity is attributed to a requisition's PRIMARY
    // recruiter (first split row, or the legacy scalar) — same Phase-1
    // convention as Recruiter Performance, so counts stay consistent
    // wherever this recruiter's activity is shown.
    const primaryOfReq = new Map<string, string | null>();
    for (const r of requisitions) {
      primaryOfReq.set(r.id, r.recruiterSplits[0]?.employeeId ?? r.recruiterId ?? null);
    }
    const primaryReqIds = requisitionIds.filter((id) => primaryOfReq.get(id) === params.id);

    const [auditLogs, applications] = await Promise.all([
      prisma.hrmsAuditLog.findMany({
        where: { orgId, entityType: "Requisition", entityId: { in: requisitionIds } },
        orderBy: { createdAt: "asc" },
      }),
      primaryReqIds.length
        ? prisma.jobApplication.findMany({
            where: { orgId, requisitionId: { in: primaryReqIds }, deletedAt: null },
            select: {
              id: true, requisitionId: true, appliedDate: true, offerSentAt: true, hiredAt: true, status: true, stageHistory: true,
              candidate: { select: { firstName: true, lastName: true } },
              interviews: {
                where: { deletedAt: null },
                orderBy: { scheduledAt: "asc" },
                select: { id: true, round: true, type: true, createdAt: true },
              },
            },
            orderBy: { appliedDate: "asc" },
          })
        : Promise.resolve([]),
    ]);

    const actorIds = new Set<string>();
    auditLogs.forEach((l) => actorIds.add(l.userId));
    const actorMap = new Map<string, { id: string; name: string; jobTitle: string | null }>();
    if (actorIds.size > 0) {
      const emps = await prisma.employee.findMany({
        where: { orgId, id: { in: [...actorIds] } },
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      });
      emps.forEach((e) => actorMap.set(e.id, { id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), jobTitle: e.jobTitle }));
    }
    const resolveActor = (id: string | null | undefined) =>
      id ? actorMap.get(id) ?? { id, name: "System", jobTitle: null } : null;

    const events: RawActivityEvent[] = [];

    for (const log of auditLogs) {
      const reqTitle = log.entityId ? titleById.get(log.entityId) : undefined;
      const prefix = reqTitle ? `${reqTitle} — ` : "";
      const changes = (log.changes ?? {}) as Record<string, unknown>;
      const metadata = (log.metadata ?? {}) as Record<string, unknown>;
      const diffObj = changes._diff as Record<string, { from: unknown; to: unknown }> | undefined;
      const actor = resolveActor(log.userId);

      if (log.action === "Create") {
        events.push({ kind: "Created", at: log.createdAt, actor, title: `${prefix}Requisition created`, description: `${changes.requisitionNumber ?? ""} · ${changes.positions ?? ""} position(s)` });
      } else if (log.action === "Approve") {
        events.push({ kind: "Approved", at: log.createdAt, actor, title: `${prefix}Approved`, description: metadata.level != null ? `Level ${metadata.level}` : null });
      } else if (log.action === "Reject") {
        events.push({ kind: "Rejected", at: log.createdAt, actor, title: `${prefix}Rejected`, description: metadata.level != null ? `Level ${metadata.level}` : null });
      } else if (log.action === "StatusChange" && diffObj?.status) {
        events.push({ kind: "StatusChanged", at: log.createdAt, actor, title: `${prefix}Status changed: ${diffObj.status.from ?? "—"} → ${diffObj.status.to ?? "—"}` });
      } else if (log.action === "Update" && typeof changes.recruiterAssigned === "string") {
        const codes = Array.isArray(changes.positionCodes) ? (changes.positionCodes as string[]) : changes.positionCode ? [String(changes.positionCode)] : [];
        events.push({ kind: "RecruiterAssigned", at: log.createdAt, actor, title: `${prefix}Recruiter assigned${codes.length ? ` — ${codes.join(", ")}` : ""}` });
      } else if (log.action === "Update" && diffObj && ("closedDate" in diffObj || "targetJoiningDate" in diffObj)) {
        events.push({ kind: "DateRevised", at: log.createdAt, actor, title: `${prefix}Timeline date revised`, description: typeof metadata.reason === "string" ? `Reason: ${metadata.reason}` : null });
      } else if (log.action === "Update" && diffObj && ("jobLevelId" in diffObj || "customSlaDays" in diffObj || "customSlaReason" in diffObj)) {
        events.push({ kind: "SlaOverrideChanged", at: log.createdAt, actor, title: `${prefix}Job Level / SLA override changed` });
      } else if (log.action === "Update" && diffObj) {
        const fields = Object.keys(diffObj);
        if (fields.length === 0) continue;
        events.push({ kind: "Updated", at: log.createdAt, actor, title: `${prefix}Updated — ${fields.map((f) => f.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())).join(", ")}` });
      }
    }

    for (const app of applications) {
      const name = `${app.candidate.firstName} ${app.candidate.lastName}`.trim();
      const reqTitle = titleById.get(app.requisitionId);

      events.push({ kind: "ApplicationReceived", at: app.appliedDate, candidateName: name, requisitionTitle: reqTitle });

      const history = Array.isArray(app.stageHistory) ? (app.stageHistory as Array<{ stage?: string; date?: string }>) : [];
      for (const h of history) {
        if (!h.date || !h.stage) continue;
        events.push({ kind: "StageChanged", at: new Date(h.date), candidateName: name, requisitionTitle: reqTitle, groupKey: prettyStage(h.stage) });
      }

      for (const iv of app.interviews) {
        events.push({ kind: "InterviewScheduled", at: iv.createdAt, candidateName: name, requisitionTitle: reqTitle, groupKey: `${iv.type}-r${iv.round}` });
      }
      if (app.offerSentAt) events.push({ kind: "OfferSent", at: app.offerSentAt, candidateName: name, requisitionTitle: reqTitle });
      if (app.status === "AppHired" && app.hiredAt) events.push({ kind: "Hired", at: app.hiredAt, candidateName: name, requisitionTitle: reqTitle });
    }

    const entries = groupActivityEvents(events);

    return successResponse({
      recruiter: { id: recruiter.id, name: `${recruiter.firstName} ${recruiter.lastName}`.trim() },
      entries,
    });
  } catch (error) {
    console.error("GET /recruit/recruiters/:id/activity error:", error);
    return internalError();
  }
});
