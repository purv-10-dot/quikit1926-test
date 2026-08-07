import type { Prisma } from "@quikit/database";

/** IDs of child records used to roll up timeline data onto an account 360. */
export interface AccountRollupIds {
  accountId: string;
  leadIds: string[];
  contactIds: string[];
  opportunityIds: string[];
}

export function buildAccountActivityWhere(
  tenantId: string,
  ids: AccountRollupIds,
): Prisma.QcfActivityWhereInput {
  const or: Prisma.QcfActivityWhereInput[] = [
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
    tenantId,
    relatedOrphanedAt: null,
    OR: or,
  };
}

export function buildAccountTaskWhere(
  tenantId: string,
  ids: AccountRollupIds,
): Prisma.QcfTaskWhereInput {
  const or: Prisma.QcfTaskWhereInput[] = [
    { relatedKind: "Account", relatedObjectId: ids.accountId },
    { relatedKind: "account", relatedObjectId: ids.accountId },
  ];
  if (ids.leadIds.length > 0) {
    or.push({ leadId: { in: ids.leadIds } });
    or.push({ relatedKind: "Lead", relatedObjectId: { in: ids.leadIds } });
    or.push({ relatedKind: "lead", relatedObjectId: { in: ids.leadIds } });
  }
  return { tenantId, OR: or };
}

export function buildAccountNoteWhere(
  tenantId: string,
  ids: AccountRollupIds,
): Prisma.QcfNoteWhereInput {
  const or: Prisma.QcfNoteWhereInput[] = [
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
  return { tenantId, OR: or };
}
