import { prisma } from "@/lib/db/prisma";

export const ACTIVITY_PRIMARY_KINDS = ["Lead", "Opportunity", "Contact", "Account"] as const;
export type ActivityPrimaryKind = (typeof ACTIVITY_PRIMARY_KINDS)[number];

/**
 * Standalone (unlinked) activities. `CrmActivity.relatedKind`/`relatedObjectId`
 * are NOT NULL columns, so a standalone activity is represented by a sentinel
 * kind "None" plus a sentinel object id that matches no real record. This needs
 * no schema migration: it still appears in Global Activities (which filters by
 * orgId, not kind) but never in any record timeline (those query by a specific
 * relatedObjectId). A future "Link to record" action just PATCHes the kind/id to
 * a real record — the row is never recreated.
 */
export const STANDALONE_KIND = "None" as const;
export const STANDALONE_RELATED_ID = "standalone" as const;

export function isStandaloneKind(v: string): boolean {
  return v === STANDALONE_KIND;
}

/** All kinds the activity composer / API accept, including the standalone sentinel. */
export const ACTIVITY_KINDS = [STANDALONE_KIND, ...ACTIVITY_PRIMARY_KINDS] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export function isPrimaryKind(v: string): v is ActivityPrimaryKind {
  return (ACTIVITY_PRIMARY_KINDS as readonly string[]).includes(v);
}

export async function assertActivityTargetExists(
  orgId: string,
  kind: string,
  id: string,
): Promise<void> {
  // Standalone activity — no related record to validate.
  if (isStandaloneKind(kind)) return;
  if (!isPrimaryKind(kind)) {
    const err = new Error(
      `relatedKind must be one of: ${ACTIVITY_PRIMARY_KINDS.join(", ")}, ${STANDALONE_KIND}`,
    ) as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  let exists: { id: string } | null = null;
  if (kind === "Lead") {
    exists = await prisma.crmLead.findFirst({ where: { id, orgId }, select: { id: true } });
  } else if (kind === "Opportunity") {
    exists = await prisma.crmOpportunity.findFirst({ where: { id, orgId }, select: { id: true } });
  } else if (kind === "Contact") {
    exists = await prisma.crmContact.findFirst({ where: { id, orgId }, select: { id: true } });
  } else if (kind === "Account") {
    exists = await prisma.crmAccount.findFirst({ where: { id, orgId }, select: { id: true } });
  }
  if (!exists) {
    const err = new Error(`${kind} not found`) as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
}

export async function getRelatedAccountId(
  orgId: string,
  kind: string,
  id: string,
): Promise<string | null> {
  if (isStandaloneKind(kind)) return null; // no account scope for standalone
  if (kind === "Account") return id;
  if (kind === "Lead") {
    const r = await prisma.crmLead.findFirst({
      where: { id, orgId },
      select: { accountId: true },
    });
    return r?.accountId ?? null;
  }
  if (kind === "Opportunity") {
    const r = await prisma.crmOpportunity.findFirst({
      where: { id, orgId },
      select: { accountId: true },
    });
    return r?.accountId ?? null;
  }
  if (kind === "Contact") {
    const r = await prisma.crmContact.findFirst({
      where: { id, orgId },
      select: { accountId: true },
    });
    return r?.accountId ?? null;
  }
  return null;
}
