import type { Prisma } from "@quikit/database";

/** IDs used to roll up timeline data onto a contact 360. */
export interface ContactRollupIds {
  contactId: string;
  leadId: string | null;
  accountId: string | null;
}

export function buildContactActivityWhere(
  orgId: string,
  ids: ContactRollupIds,
): Prisma.CrmActivityWhereInput {
  const or: Prisma.CrmActivityWhereInput[] = [
    { relatedKind: "Contact", relatedObjectId: ids.contactId },
    { relatedKind: "contact", relatedObjectId: ids.contactId },
  ];
  if (ids.leadId) {
    or.push({ leadId: ids.leadId });
    or.push({ relatedKind: "Lead", relatedObjectId: ids.leadId });
    or.push({ relatedKind: "lead", relatedObjectId: ids.leadId });
  }
  if (ids.accountId) {
    or.push({ relatedKind: "Account", relatedObjectId: ids.accountId });
    or.push({ relatedKind: "account", relatedObjectId: ids.accountId });
  }
  return {
    orgId,
    relatedOrphanedAt: null,
    OR: or,
  };
}

export function buildContactTaskWhere(
  orgId: string,
  ids: ContactRollupIds,
): Prisma.CrmTaskWhereInput {
  const or: Prisma.CrmTaskWhereInput[] = [
    { relatedKind: "Contact", relatedObjectId: ids.contactId },
    { relatedKind: "contact", relatedObjectId: ids.contactId },
  ];
  if (ids.leadId) {
    or.push({ leadId: ids.leadId });
    or.push({ relatedKind: "Lead", relatedObjectId: ids.leadId });
    or.push({ relatedKind: "lead", relatedObjectId: ids.leadId });
  }
  return { orgId, OR: or };
}

export function buildContactNoteWhere(
  orgId: string,
  ids: ContactRollupIds,
): Prisma.CrmNoteWhereInput {
  const or: Prisma.CrmNoteWhereInput[] = [
    { relatedKind: "Contact", relatedObjectId: ids.contactId },
    { relatedKind: "contact", relatedObjectId: ids.contactId },
  ];
  if (ids.leadId) {
    or.push({ leadId: ids.leadId });
    or.push({ relatedKind: "Lead", relatedObjectId: ids.leadId });
    or.push({ relatedKind: "lead", relatedObjectId: ids.leadId });
  }
  return { orgId, OR: or };
}
