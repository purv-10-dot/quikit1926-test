import type { Prisma } from "@quikit/database";

/** IDs of child records used to roll up timeline data onto an account 360. */
export interface AccountRollupIds {
  accountId: string;
  leadIds: string[];
  contactIds: string[];
  opportunityIds: string[];
}

export function buildAccountActivityWhere(
  orgId: string,
  ids: AccountRollupIds,
): Prisma.CrmActivityWhereInput {
  const or: Prisma.CrmActivityWhereInput[] = [
    { relatedKind: "Account", relatedObjectId: ids.accountId },
    { relatedKind: "account", relatedObjectId: ids.accountId },
  ];
  if (ids.leadIds.length > 0) {
    or.push({ leadId: { in: ids.leadIds } });
    or.push({ relatedKind: "Lead", relatedObjectId: { in: ids.leadIds } });
    or.push({ relatedKind: "lead", relatedObjectId: { in: ids.leadIds } });
  }
  if (ids.contactIds.length > 0) {
    or.push({ relatedKind: "Contact", relatedObjectId: { in: ids.contactIds } });
  }
  if (ids.opportunityIds.length > 0) {
    or.push({ opportunityId: { in: ids.opportunityIds } });
    or.push({ relatedKind: "Opportunity", relatedObjectId: { in: ids.opportunityIds } });
  }
  return {
    orgId,
    relatedOrphanedAt: null,
    OR: or,
  };
}

export function buildAccountTaskWhere(
  orgId: string,
  ids: AccountRollupIds,
): Prisma.CrmTaskWhereInput {
  const or: Prisma.CrmTaskWhereInput[] = [
    { relatedKind: "Account", relatedObjectId: ids.accountId },
    { relatedKind: "account", relatedObjectId: ids.accountId },
  ];
  if (ids.leadIds.length > 0) {
    or.push({ leadId: { in: ids.leadIds } });
    or.push({ relatedKind: "Lead", relatedObjectId: { in: ids.leadIds } });
    or.push({ relatedKind: "lead", relatedObjectId: { in: ids.leadIds } });
  }
  return { orgId, OR: or };
}

export function buildAccountNoteWhere(
  orgId: string,
  ids: AccountRollupIds,
): Prisma.CrmNoteWhereInput {
  const or: Prisma.CrmNoteWhereInput[] = [
    { relatedKind: "Account", relatedObjectId: ids.accountId },
    { relatedKind: "account", relatedObjectId: ids.accountId },
  ];
  if (ids.leadIds.length > 0) {
    or.push({ leadId: { in: ids.leadIds } });
    or.push({ relatedKind: "Lead", relatedObjectId: { in: ids.leadIds } });
    or.push({ relatedKind: "lead", relatedObjectId: { in: ids.leadIds } });
  }
  if (ids.contactIds.length > 0) {
    or.push({ relatedKind: "Contact", relatedObjectId: { in: ids.contactIds } });
  }
  return { orgId, OR: or };
}
