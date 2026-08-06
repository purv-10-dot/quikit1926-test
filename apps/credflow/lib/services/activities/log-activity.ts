// Server-trusted activity creator. Internal callers (imports, new endpoints
// in this PR) skip the auth/ACL hop and stay transactional via the optional
// `tx` argument.
//
// Idempotency: when both `externalId` and `sourceSystem` are non-empty,
// upsert on the unique partial index (tenantId, sourceSystem, externalId).
// Replays from external systems (dialer webhooks, email sync, calendar)
// dedupe naturally.
//
// Ownership: never trust a client-supplied `ownerName`. Resolve from the
// User row identified by `userId`. `ownerName` is a denormalized cache and
// must be refreshed by the caller when a user is renamed.
import type { CrmActivity, Prisma, PrismaClient } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { touchLeadLastActivity } from "@/lib/services/leads/touch-last-activity";

type Tx = PrismaClient | Prisma.TransactionClient;

export type LogActivityInput = {
  tenantId: string;
  userId?: string;
  ownerId?: string;
  type: string;
  relatedKind: "Lead" | "Opportunity" | "Contact" | "Account";
  relatedObjectId: string;
  subject?: string;
  outcome?: string;
  occurredAt?: Date;
  externalId?: string;
  sourceSystem?: string;
  linkedCallLogId?: string;
  detailNotes?: string;
  followUpAt?: Date;
  opportunityId?: string;
  leadId?: string;
  activityCode?: string;
  logOutcome?: string;
  outreach?: Prisma.InputJsonValue;
  ownerName?: string; // optional override; if userId is set, resolved from User
  tx?: Tx;
};

async function resolveOwnerDisplay(
  tx: Tx,
  userId: string | undefined,
): Promise<{ id: string | null; name: string }> {
  if (!userId) return { id: null, name: "" };
  const u = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  if (!u) return { id: null, name: "" };
  const composed = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return { id: u.id, name: composed || u.email || "" };
}

export async function logActivity(input: LogActivityInput): Promise<CrmActivity> {
  const tx: Tx = input.tx ?? prisma;
  const ownerIdInput = input.ownerId ?? input.userId;
  const owner = await resolveOwnerDisplay(tx, ownerIdInput);
  const ownerName = input.ownerName?.trim() || owner.name;

  const data = {
    tenantId: input.tenantId,
    type: input.type,
    relatedKind: input.relatedKind,
    relatedObjectId: input.relatedObjectId,
    subject: input.subject ?? "",
    outcome: input.outcome ?? "",
    ownerId: owner.id ?? ownerIdInput ?? null,
    ownerName,
    externalId: input.externalId ?? null,
    sourceSystem: input.sourceSystem ?? null,
    occurredAt: input.occurredAt ?? new Date(),
    detailNotes: input.detailNotes ?? null,
    followUpAt: input.followUpAt ?? null,
    opportunityId: input.opportunityId ?? null,
    leadId: input.leadId ?? (input.relatedKind === "Lead" ? input.relatedObjectId : null),
    linkedCallLogId: input.linkedCallLogId ?? null,
    activityCode: input.activityCode ?? null,
    logOutcome: input.logOutcome ?? null,
    outreach: input.outreach ?? undefined,
  } satisfies Prisma.CrmActivityUncheckedCreateInput;

  // Dedupe path: only when BOTH externalId and sourceSystem are present.
  // The unique partial index allows multiple rows with null externalId.
  const activity =
    input.externalId && input.sourceSystem
      ? await tx.crmActivity.upsert({
          where: {
            tenantId_sourceSystem_externalId: {
              tenantId: input.tenantId,
              sourceSystem: input.sourceSystem,
              externalId: input.externalId,
            },
          },
          create: data,
          update: {}, // idempotent: re-running with same key is a no-op
        })
      : await tx.crmActivity.create({ data });

  // [last-activity] Advance the lead's last_activity_date whenever an activity
  // is logged against a lead, so activity-date filters (e.g. "Last Activity
  // Date is before today") re-evaluate. This is the central chokepoint for
  // transition/stage-change/import activities; the call-disposition engine
  // stamps its own (it writes CrmActivity directly, bypassing this function),
  // and notes/tasks stamp at their own create sites. Guarded to Lead activities
  // with a resolvable leadId. Uses the same tx so it commits atomically. Pure
  // field write — no activity/automation emit — so it cannot recurse here.
  const stampLeadId =
    data.leadId ?? (input.relatedKind === "Lead" ? input.relatedObjectId : null);
  if (stampLeadId) {
    await touchLeadLastActivity({
      tenantId: input.tenantId,
      leadId: stampLeadId,
      when: data.occurredAt,
      label: input.type,
      tx,
    });
  }

  return activity;
}
