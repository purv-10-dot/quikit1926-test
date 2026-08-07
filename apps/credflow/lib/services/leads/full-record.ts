/**
 * Aggregator for the lead detail page — used by both
 *   GET /api/leads/[id]/full (HTTP API)
 * and the Server Component lead detail page directly.
 *
 * Returns null if the lead doesn't exist or the user lacks access.
 */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { maskHiddenLeadFields } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { isOwnerRestricted } from "@/lib/auth/owner-scope";
import { buildLeadDashboardSnapshot } from "@/lib/services/leads/dashboard-snapshot";
import { computeLeadInsights, type LeadInsights } from "@/lib/services/leads/lead-insights";
import { buildLeadAnalytics, type LeadAnalyticsBundle } from "@/lib/services/leads/lead-analytics";
import {
  resolveStepIndex,
  getStepProbability,
} from "@/lib/services/leads/pipeline-stepper";
import { getPipelineConfig } from "@/lib/services/workspace/pipeline-config";
import {
  resolveLeadComposeEmail,
  type LeadComposeEmailSource,
} from "@/lib/leads/resolve-compose-email";

export type ComposeEmailAccess = {
  to: string | null;
  blockReason: "missing" | "hidden" | null;
};

export function resolveComposeEmailAccess(
  beforeMask: LeadComposeEmailSource,
  afterMask: LeadComposeEmailSource,
): ComposeEmailAccess {
  const had = resolveLeadComposeEmail(beforeMask);
  const visible = resolveLeadComposeEmail(afterMask);
  if (!had) return { to: null, blockReason: "missing" };
  if (!visible) return { to: null, blockReason: "hidden" };
  return { to: visible, blockReason: null };
}

export async function getFullLeadRecord(opts: { user: SessionUser; leadId: string }) {
  const { user, leadId } = opts;
  // findUnique bypasses the soft-delete middleware so we can render a deleted
  // lead in read-only mode on the detail page (URL access from the trash row).
  // Include the linked account so the edit form can pre-fill the "Link account"
  // searchable input without a second round-trip.
  const lead = await prisma.qcfLead.findUnique({
    where: { id: leadId },
    include: { account: { select: { id: true, name: true } } },
  });
  if (!lead || lead.tenantId !== user.tenantId) return null;
  await assertAccountAccess(user, lead.accountId);
  // Owner-restricted roles: a non-owned lead reads as "not found" (null), matching
  // this function's existing no-access contract (the route/page render 404).
  if ((await isOwnerRestricted(user)) && lead.ownerId !== user.userId) return null;

  // Call logs surface on a lead by leadId OR by phone-tail match — a call placed
  // to/from the lead's number that never got a leadId stamped (e.g. a recording
  // that attached to a not-yet-dispositioned stub). This MIRRORS the
  // /api/telephony/call-logs read so the Timeline and Call Disposition tabs show
  // the SAME calls (and therefore the same recordings/players). Without it, a
  // leadId-null recorded call appears in Call Disposition (which phone-matches)
  // but is missing entirely from the Timeline seed (which only matched leadId).
  const callTails = [lead.phone, lead.mobile]
    .map((n) => (n || "").replace(/\D+/g, ""))
    .filter((d) => d.length >= 10)
    .map((d) => d.slice(-10));

  const [activities, tasks, notes, opportunities, callLogs, attachments, slaTracking] =
    await Promise.all([
    prisma.qcfActivity.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { leadId },
          { relatedKind: "lead", relatedObjectId: leadId },
          { relatedKind: "Lead", relatedObjectId: leadId },
        ],
      },
      orderBy: { occurredAt: "desc" },
      take: 50,
    }),
    prisma.qcfTask.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { leadId },
          { relatedKind: "lead", relatedObjectId: leadId },
          { relatedKind: "Lead", relatedObjectId: leadId },
        ],
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 50,
    }),
    prisma.qcfNote.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { leadId },
          { relatedKind: "lead", relatedObjectId: leadId },
          { relatedKind: "Lead", relatedObjectId: leadId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.qcfOpportunity.findMany({
      where: { tenantId: user.tenantId, leadId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.qcfCallLog.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [
          { leadId },
          ...callTails.flatMap((t) => [
            { destinationNumber: { endsWith: t } },
            { sourceNumber: { endsWith: t } },
          ]),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.qcfDocument.findMany({
      where: {
        tenantId: user.tenantId,
        refType: "lead",
        refId: leadId,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.qcfSlaLeadTracking.findMany({
      where: { tenantId: user.tenantId, leadId },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ]);

  const emailSource = (row: typeof lead): LeadComposeEmailSource => ({
    email: row.email,
    secondaryEmail: (row as { secondaryEmail?: string | null }).secondaryEmail ?? null,
  });
  const masked = await maskHiddenLeadFields(user, lead);
  const composeEmailAfterMask = resolveComposeEmailAccess(
    emailSource(lead),
    emailSource(masked),
  );
  const snapshot = buildLeadDashboardSnapshot({
    createdAt: lead.createdAt,
    tasks,
    activities,
    notes,
    opportunities,
    callLogs,
    attachments,
    slaTracking,
  });

  const insights = computeLeadInsights({
    score: lead.score,
    stage: lead.stage,
    status: lead.status,
    isDisengaged: lead.isDisengaged,
    daysSinceCreated: snapshot.daysSinceCreated,
    openTasks: snapshot.openTasks,
    activitiesCount: snapshot.activitiesCount,
    callsCount: snapshot.callsCount,
    notesCount: snapshot.notesCount,
    nextFollowUpAt: snapshot.nextFollowUpAt,
    activities,
    callLogs,
  });

  const pipeline = await getPipelineConfig(user.tenantId);
  const analytics = buildLeadAnalytics({
    createdAt: lead.createdAt,
    score: lead.score,
    stage: lead.stage,
    stageProbability: getStepProbability(resolveStepIndex(lead.stage)),
    activities: activities.map((a) => ({ at: a.occurredAt ?? a.createdAt })),
    calls: callLogs.map((c) => ({ at: c.startTime ?? c.createdAt })),
    notes: notes.map((n) => ({ at: n.createdAt })),
    tasks: tasks.map((t) => ({ at: t.dueDate ?? t.createdAt })),
  });

  return {
    lead: masked,
    composeEmail: composeEmailAfterMask,
    activities,
    tasks,
    notes,
    opportunities,
    callLogs,
    attachments,
    slaTracking,
    snapshot,
    insights,
    analytics,
    pipelineStages: pipeline.stages,
    pipelineStatuses: pipeline.statuses,
  };
}

export type LeadInsightsDto = LeadInsights;
export type LeadAnalyticsDto = LeadAnalyticsBundle;

export type FullLeadRecord = NonNullable<Awaited<ReturnType<typeof getFullLeadRecord>>>;
