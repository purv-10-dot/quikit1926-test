import { prisma } from "@/lib/db/prisma";

export const ACTIVITY_PRIMARY_KINDS = ["Lead", "Opportunity", "Contact", "Account"] as const;
export type ActivityPrimaryKind = (typeof ACTIVITY_PRIMARY_KINDS)[number];

export function isPrimaryKind(v: string): v is ActivityPrimaryKind {
  return (ACTIVITY_PRIMARY_KINDS as readonly string[]).includes(v);
}

export async function assertActivityTargetExists(
  orgId: string,
  kind: string,
  id: string,
): Promise<void> {
  if (!isPrimaryKind(kind)) {
    const err = new Error(
      `relatedKind must be one of: ${ACTIVITY_PRIMARY_KINDS.join(", ")}`,
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
