import type { CrmLead } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { getLeadScoringConfig } from "@/lib/services/leads/lead-scoring/config";
import {
  computeLeadScore,
  type LeadScoringLeadInput,
} from "@/lib/services/leads/lead-scoring/compute-score";
import type { LeadScoringContext } from "@/lib/services/leads/lead-scoring/types";

const LEAD_RELATED_OR = (leadId: string) => [
  { leadId },
  { relatedKind: "lead", relatedObjectId: leadId },
  { relatedKind: "Lead", relatedObjectId: leadId },
];

function toLeadInput(lead: CrmLead): LeadScoringLeadInput {
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    mobile: lead.mobile,
    company: lead.company,
    jobTitle: lead.jobTitle,
    source: lead.source,
    stage: lead.stage,
    status: lead.status,
    substatus: lead.substatus,
    industry: lead.industry,
    country: lead.country,
    leadQuality: lead.leadQuality,
    isStarred: lead.isStarred,
    isDisengaged: lead.isDisengaged,
    followupPriority: lead.followupPriority,
    website: lead.website ?? null,
    linkedinUrl: lead.linkedinUrl ?? null,
    dynamicFields: (lead.dynamicFields as Record<string, unknown> | null) ?? null,
  };
}

export async function loadLeadScoringContext(
  orgId: string,
  leadId: string,
  leadCreatedAt: Date,
): Promise<LeadScoringContext> {
  const relatedOr = LEAD_RELATED_OR(leadId);
  const now = new Date();

  const [activitiesCount, callsCount, notesCount, tasks, lastActivity, lastCall] =
    await Promise.all([
      prisma.crmActivity.count({
        where: { orgId, OR: relatedOr },
      }),
      prisma.crmCallLog.count({ where: { orgId, leadId } }),
      prisma.crmNote.count({ where: { orgId, OR: relatedOr } }),
      prisma.crmTask.findMany({
        where: { orgId, OR: relatedOr },
        select: { status: true },
      }),
      prisma.crmActivity.findFirst({
        where: { orgId, OR: relatedOr },
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true, createdAt: true },
      }),
      prisma.crmCallLog.findFirst({
        where: { orgId, leadId },
        orderBy: { startTime: "desc" },
        select: { startTime: true, createdAt: true },
      }),
    ]);

  let openTasks = 0;
  for (const t of tasks) {
    if (t.status !== "Completed" && t.status !== "Cancelled") openTasks += 1;
  }

  const touchMs: number[] = [];
  const actAt = lastActivity?.occurredAt ?? lastActivity?.createdAt;
  if (actAt) touchMs.push(new Date(actAt).getTime());
  const callAt = lastCall?.startTime ?? lastCall?.createdAt;
  if (callAt) touchMs.push(new Date(callAt).getTime());
  const lastTouchMs = touchMs.length > 0 ? Math.max(...touchMs) : null;
  const lastTouchHours =
    lastTouchMs != null
      ? Math.max(0, (now.getTime() - lastTouchMs) / (60 * 60 * 1000))
      : null;

  const daysSinceCreated = Math.max(
    0,
    Math.floor((now.getTime() - leadCreatedAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  return {
    activitiesCount,
    callsCount,
    notesCount,
    openTasks,
    lastTouchHours,
    daysSinceCreated,
  };
}

export type RecalculateLeadScoreResult = {
  leadId: string;
  previousScore: number;
  score: number;
  changed: boolean;
  breakdown: ReturnType<typeof computeLeadScore>;
};

/**
 * Recompute and persist lead score. Returns null if lead missing or scoring disabled.
 */
export async function recalculateLeadScore(
  orgId: string,
  leadId: string,
): Promise<RecalculateLeadScoreResult | null> {
  const config = await getLeadScoringConfig(orgId);
  if (!config.enabled || !config.autoRecalculate) return null;

  const lead = await prisma.crmLead.findFirst({
    where: { id: leadId, orgId, deletedAt: null },
  });
  if (!lead) return null;

  const ctx = await loadLeadScoringContext(orgId, leadId, lead.createdAt);
  const breakdown = computeLeadScore(toLeadInput(lead), ctx, config);
  const previousScore = lead.score;

  if (breakdown.total !== previousScore) {
    await prisma.crmLead.update({
      where: { id: leadId },
      data: { score: breakdown.total },
    });
  }

  return {
    leadId,
    previousScore,
    score: breakdown.total,
    changed: breakdown.total !== previousScore,
    breakdown,
  };
}

export async function recalculateAllLeadScores(orgId: string): Promise<{
  processed: number;
  updated: number;
}> {
  const config = await getLeadScoringConfig(orgId);
  if (!config.enabled) return { processed: 0, updated: 0 };

  const leads = await prisma.crmLead.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true },
  });

  let updated = 0;
  for (const { id } of leads) {
    const r = await recalculateLeadScore(orgId, id);
    if (r?.changed) updated += 1;
  }
  return { processed: leads.length, updated };
}

/** Resolve lead id from activity payload. */
export function resolveLeadIdFromActivity(input: {
  leadId?: string | null;
  relatedKind?: string | null;
  relatedObjectId?: string | null;
}): string | null {
  if (input.leadId) return input.leadId;
  const kind = (input.relatedKind ?? "").toLowerCase();
  if (kind === "lead" && input.relatedObjectId) return input.relatedObjectId;
  return null;
}
