import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { stageNames } from "@/lib/services/pipeline-stages";

type TimelineKind =
  | "CandidateCreated"
  | "CandidateUpdated"
  | "Blacklisted"
  | "Unblacklisted"
  | "Archived"
  | "Unarchived"
  | "ApplicationCreated"
  | "StageChanged"
  | "InterviewScheduled"
  | "InterviewCompleted"
  | "FeedbackSubmitted"
  | "OfferCreated"
  | "OfferSent"
  | "ApplicationRejected"
  | "ApplicationHired";

interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  actor?: { id: string; name: string; jobTitle?: string | null } | null;
  at: string;
}

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const candidate = await prisma.candidate.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!candidate) return notFound("Candidate not found");

    const applications = await prisma.jobApplication.findMany({
      where: { orgId, candidateId: params.id, deletedAt: null },
      include: {
        requisition: { select: { id: true, title: true, requisitionNumber: true, pipelineId: true } },
        interviews: {
          where: { deletedAt: null },
          orderBy: { scheduledAt: "asc" },
          include: {
            interviewer: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
          },
        },
      },
      orderBy: { appliedDate: "asc" },
    });

    const auditLogs = await prisma.hrmsAuditLog.findMany({
      where: { orgId, entityType: "Candidate", entityId: params.id },
      orderBy: { createdAt: "asc" },
    });

    const actorIds = new Set<string>();
    auditLogs.forEach((l) => actorIds.add(l.userId));
    const actorMap = new Map<string, { id: string; name: string; jobTitle: string | null }>();
    if (actorIds.size > 0) {
      const emps = await prisma.employee.findMany({
        where: { orgId, OR: [{ id: { in: Array.from(actorIds) } }] },
        select: { id: true, firstName: true, lastName: true, jobTitle: true },
      });
      emps.forEach((e) =>
        actorMap.set(e.id, { id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), jobTitle: e.jobTitle }),
      );
    }
    const resolveActor = (id: string | null | undefined) =>
      id ? actorMap.get(id) ?? { id, name: "System", jobTitle: null } : null;

    const entries: TimelineEntry[] = [];

    entries.push({
      id: `cand-${candidate.id}`,
      kind: "CandidateCreated",
      title: "Candidate added to system",
      description: `${candidate.source} · ${candidate.email}`,
      actor: resolveActor(candidate.createdBy),
      at: candidate.createdAt.toISOString(),
    });

    for (const app of applications) {
      entries.push({
        id: `app-${app.id}`,
        kind: "ApplicationCreated",
        title: `Applied to ${app.requisition.title}`,
        description: app.requisition.requisitionNumber,
        metadata: { applicationId: app.id, requisitionId: app.requisition.id },
        actor: resolveActor(app.createdBy),
        at: app.appliedDate.toISOString(),
      });

      const pipeline = app.requisition.pipelineId
        ? await prisma.hiringPipeline.findFirst({ where: { id: app.requisition.pipelineId, orgId } })
        : await prisma.hiringPipeline.findFirst({ where: { orgId, isDefault: true, deletedAt: null } });
      const names = stageNames(pipeline?.stages);

      const history = Array.isArray(app.stageHistory) ? (app.stageHistory as Array<{ stage?: string; date?: string; movedBy?: string; reason?: string }>) : [];
      history.forEach((h, i) => {
        if (!h.date) return;
        entries.push({
          id: `stage-${app.id}-${i}`,
          kind: "StageChanged",
          title: `Moved to "${h.stage ?? "Unknown"}"`,
          description: h.reason ?? null,
          metadata: { applicationId: app.id, stage: h.stage },
          actor: resolveActor(h.movedBy ?? null),
          at: new Date(h.date).toISOString(),
        });
      });

      for (const iv of app.interviews) {
        const stageName = names[iv.round - 1] ?? `Round ${iv.round}`;
        entries.push({
          id: `int-${iv.id}`,
          kind: "InterviewScheduled",
          title: `${stageName} interview scheduled`,
          description: `${iv.type} · ${iv.duration} min · Interviewer: ${iv.interviewer.firstName} ${iv.interviewer.lastName}`,
          metadata: { interviewId: iv.id, round: iv.round, type: iv.type },
          actor: { id: iv.interviewer.id, name: `${iv.interviewer.firstName} ${iv.interviewer.lastName}`.trim(), jobTitle: iv.interviewer.jobTitle },
          at: iv.createdAt.toISOString(),
        });

        if (iv.status === "IntCompleted") {
          entries.push({
            id: `int-done-${iv.id}`,
            kind: "InterviewCompleted",
            title: `${stageName} interview completed`,
            metadata: { interviewId: iv.id },
            actor: { id: iv.interviewer.id, name: `${iv.interviewer.firstName} ${iv.interviewer.lastName}`.trim(), jobTitle: iv.interviewer.jobTitle },
            at: iv.updatedAt.toISOString(),
          });
        }

        if (iv.overallRating != null) {
          entries.push({
            id: `sc-${iv.id}`,
            kind: "FeedbackSubmitted",
            title: `Feedback: ${iv.recommendation}`,
            description: `${stageName} · Rating ${iv.overallRating}/5${iv.overallComments ? ` — ${iv.overallComments.slice(0, 120)}` : ""}`,
            metadata: {
              scorecardId: iv.id,
              stage: stageName,
              rating: iv.overallRating,
              recommendation: iv.recommendation,
            },
            actor: { id: iv.interviewer.id, name: `${iv.interviewer.firstName} ${iv.interviewer.lastName}`.trim(), jobTitle: iv.interviewer.jobTitle },
            at: (iv.scorecardSubmittedAt ?? iv.updatedAt).toISOString(),
          });
        }
      }

      if (app.offerStatus != null) {
        entries.push({
          id: `offer-${app.id}`,
          kind: "OfferCreated",
          title: "Offer created",
          description: `${app.offerDesignation ?? ""} · CTC ₹${Number(app.offeredCTC ?? 0).toLocaleString("en-IN")}`,
          metadata: { offerId: app.id, status: app.offerStatus },
          actor: resolveActor(app.offerCreatedBy),
          at: (app.offerCreatedAt ?? app.createdAt).toISOString(),
        });
        if (app.offerSentAt) {
          entries.push({
            id: `offer-sent-${app.id}`,
            kind: "OfferSent",
            title: "Offer sent to candidate",
            actor: resolveActor(app.updatedBy),
            at: app.offerSentAt.toISOString(),
          });
        }
      }

      if (app.status === "AppRejected") {
        entries.push({
          id: `app-rej-${app.id}`,
          kind: "ApplicationRejected",
          title: "Application rejected",
          description: `${app.rejectionStage ? `At ${app.rejectionStage} · ` : ""}${app.rejectionReason ?? ""}`,
          actor: resolveActor(app.updatedBy),
          at: app.updatedAt.toISOString(),
        });
      }
      if (app.status === "AppHired") {
        entries.push({
          id: `app-hire-${app.id}`,
          kind: "ApplicationHired",
          title: "Candidate hired",
          actor: resolveActor(app.updatedBy),
          at: app.updatedAt.toISOString(),
        });
      }
    }

    for (const log of auditLogs) {
      const changes = (log.changes ?? {}) as Record<string, unknown>;
      const action = changes.action as string | undefined;
      if (!action) continue;
      const actor = resolveActor(log.userId);
      if (action === "Blacklisted") {
        entries.push({
          id: `log-${log.id}`,
          kind: "Blacklisted",
          title: "Candidate blacklisted",
          description: `Reason: ${changes.blacklistReason ?? "—"}${changes.blacklistedUntil ? ` · Until ${new Date(String(changes.blacklistedUntil)).toLocaleDateString()}` : " · Permanent"}`,
          metadata: { reason: changes.blacklistReason, until: changes.blacklistedUntil },
          actor,
          at: log.createdAt.toISOString(),
        });
      } else if (action === "Unblacklisted") {
        entries.push({ id: `log-${log.id}`, kind: "Unblacklisted", title: "Candidate unblacklisted", actor, at: log.createdAt.toISOString() });
      } else if (action === "Archived") {
        entries.push({
          id: `log-${log.id}`,
          kind: "Archived",
          title: "Candidate archived",
          description: changes.reason ? `Reason: ${changes.reason}` : null,
          actor,
          at: log.createdAt.toISOString(),
        });
      } else if (action === "Unarchived") {
        entries.push({ id: `log-${log.id}`, kind: "Unarchived", title: "Candidate unarchived", actor, at: log.createdAt.toISOString() });
      }
    }

    entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    return successResponse({
      candidate: {
        id: candidate.id,
        name: `${candidate.firstName} ${candidate.lastName}`.trim(),
        email: candidate.email,
        status: candidate.status,
        isBlacklisted: candidate.isBlacklisted,
        blacklistReason: candidate.blacklistReason,
        blacklistedAt: candidate.blacklistedAt,
        blacklistedUntil: candidate.blacklistedUntil,
        isArchived: candidate.isArchived,
        archivedAt: candidate.archivedAt,
        createdAt: candidate.createdAt,
      },
      entries,
    });
  } catch (error) {
    console.error("GET /recruit/candidates/:id/timeline error:", error);
    return internalError();
  }
});
