import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { groupActivityEvents, prettyStage, type RawActivityEvent } from "@/lib/recruit/activity-timeline";

/** Combines this requisition's audit trail (create/edit/status/approve/reject/
 * recruiter-assign) with derived, DATE-GROUPED events from its applications
 * (received, stage moves, interview, offer, hire) — e.g. "5 candidates moved
 * to Source" instead of 5 separate lines, same as the Recruiter Activity view. */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const requisition = await prisma.jobRequisition.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true, title: true, requisitionNumber: true, status: true, createdAt: true },
    });
    if (!requisition) return notFound("Requisition not found");

    const auditLogs = await prisma.hrmsAuditLog.findMany({
      where: { orgId, entityType: "Requisition", entityId: params.id },
      orderBy: { createdAt: "asc" },
    });

    const applications = await prisma.jobApplication.findMany({
      where: { orgId, requisitionId: params.id, deletedAt: null },
      select: {
        id: true, appliedDate: true, offerSentAt: true, hiredAt: true, status: true, stageHistory: true,
        candidate: { select: { firstName: true, lastName: true } },
        interviews: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, round: true, type: true, scheduledAt: true, createdAt: true },
        },
      },
      orderBy: { appliedDate: "asc" },
    });

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
      const changes = (log.changes ?? {}) as Record<string, unknown>;
      const metadata = (log.metadata ?? {}) as Record<string, unknown>;
      const diffObj = changes._diff as Record<string, { from: unknown; to: unknown }> | undefined;
      const actor = resolveActor(log.userId);

      if (log.action === "Create") {
        events.push({
          kind: "Created", at: log.createdAt, actor,
          title: "Requisition created",
          description: `${changes.requisitionNumber ?? ""} · ${changes.positions ?? ""} position(s)`,
        });
      } else if (log.action === "Approve") {
        events.push({ kind: "Approved", at: log.createdAt, actor, title: "Approved", description: metadata.level != null ? `Level ${metadata.level}` : null });
      } else if (log.action === "Reject") {
        events.push({ kind: "Rejected", at: log.createdAt, actor, title: "Rejected", description: metadata.level != null ? `Level ${metadata.level}` : null });
      } else if (log.action === "StatusChange" && diffObj?.status) {
        events.push({ kind: "StatusChanged", at: log.createdAt, actor, title: `Status changed: ${diffObj.status.from ?? "—"} → ${diffObj.status.to ?? "—"}` });
      } else if (log.action === "Update" && typeof changes.recruiterAssigned === "string") {
        const codes = Array.isArray(changes.positionCodes) ? (changes.positionCodes as string[]) : changes.positionCode ? [String(changes.positionCode)] : [];
        events.push({ kind: "RecruiterAssigned", at: log.createdAt, actor, title: `Recruiter assigned${codes.length ? ` — ${codes.join(", ")}` : ""}` });
      } else if (log.action === "Update" && diffObj && ("closedDate" in diffObj || "targetJoiningDate" in diffObj)) {
        events.push({ kind: "DateRevised", at: log.createdAt, actor, title: "Timeline date revised", description: typeof metadata.reason === "string" ? `Reason: ${metadata.reason}` : null });
      } else if (log.action === "Update" && diffObj && ("jobLevelId" in diffObj || "customSlaDays" in diffObj || "customSlaReason" in diffObj)) {
        events.push({ kind: "SlaOverrideChanged", at: log.createdAt, actor, title: "Job Level / SLA override changed" });
      } else if (log.action === "Update" && diffObj) {
        const fields = Object.keys(diffObj);
        if (fields.length === 0) continue;
        events.push({ kind: "Updated", at: log.createdAt, actor, title: `Updated — ${fields.map((f) => f.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())).join(", ")}` });
      }
    }

    for (const app of applications) {
      const name = `${app.candidate.firstName} ${app.candidate.lastName}`.trim();

      events.push({ kind: "ApplicationReceived", at: app.appliedDate, candidateName: name });

      const history = Array.isArray(app.stageHistory) ? (app.stageHistory as Array<{ stage?: string; date?: string }>) : [];
      for (const h of history) {
        if (!h.date || !h.stage) continue;
        events.push({ kind: "StageChanged", at: new Date(h.date), candidateName: name, groupKey: prettyStage(h.stage) });
      }

      for (const iv of app.interviews) {
        events.push({ kind: "InterviewScheduled", at: iv.createdAt, candidateName: name, groupKey: `${iv.type}-r${iv.round}` });
      }
      if (app.offerSentAt) events.push({ kind: "OfferSent", at: app.offerSentAt, candidateName: name });
      if (app.status === "AppHired" && app.hiredAt) events.push({ kind: "Hired", at: app.hiredAt, candidateName: name });
    }

    const entries = groupActivityEvents(events);

    return successResponse({
      requisition: {
        id: requisition.id, title: requisition.title, requisitionNumber: requisition.requisitionNumber,
        status: requisition.status, createdAt: requisition.createdAt,
      },
      entries,
    });
  } catch (error) {
    console.error("GET /recruit/requisitions/:id/timeline error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.recruit.read"] });
