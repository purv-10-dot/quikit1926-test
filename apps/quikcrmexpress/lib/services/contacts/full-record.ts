/**
 * Aggregator for the contact 360 page and GET /api/contacts/[id]/full.
 */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { buildContactDashboardSnapshot } from "@/lib/services/contacts/dashboard-snapshot";
import {
  buildContactActivityWhere,
  buildContactNoteWhere,
  buildContactTaskWhere,
  type ContactRollupIds,
} from "@/lib/services/contacts/rollup-where";

export interface Contact360Row {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountId: string | null;
  accountName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  leadId: string | null;
  leadName: string | null;
  city: string | null;
  contactStage: string | null;
  source: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FullContactRecord {
  contact: Contact360Row;
  account: { id: string; name: string } | null;
  lead: { id: string; name: string; company: string | null } | null;
  snapshot: ReturnType<typeof buildContactDashboardSnapshot>;
  opportunities: {
    id: string;
    name: string;
    stage: string;
    amount: unknown;
    currency: string | null;
    probability: number;
    closeDate: Date | null;
    ownerName: string | null;
    createdAt: Date;
    updatedAt: Date;
  }[];
  activities: Awaited<ReturnType<typeof loadActivities>>;
  tasks: Awaited<ReturnType<typeof loadTasks>>;
  notes: Awaited<ReturnType<typeof loadNotes>>;
  callLogs: Awaited<ReturnType<typeof loadCallLogs>>;
  attachments: Awaited<ReturnType<typeof loadAttachments>>;
}

function toContact360Row(c: {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  accountId: string | null;
  ownerId: string | null;
  ownerName: string | null;
  leadId: string | null;
  city: string | null;
  contactStage: string | null;
  source: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  account?: { id: string; name: string } | null;
  lead?: { id: string; name: string; company: string | null } | null;
}): Contact360Row {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    title: c.title,
    accountId: c.accountId,
    accountName: c.account?.name ?? null,
    ownerId: c.ownerId,
    ownerName: c.ownerName,
    leadId: c.leadId,
    leadName: c.lead
      ? c.lead.company
        ? `${c.lead.name} — ${c.lead.company}`
        : c.lead.name
      : null,
    city: c.city,
    contactStage: c.contactStage,
    source: c.source,
    deletedAt: c.deletedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

async function loadActivities(orgId: string, ids: ContactRollupIds) {
  return prisma.qceActivity.findMany({
    where: buildContactActivityWhere(orgId, ids),
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}

async function loadTasks(orgId: string, ids: ContactRollupIds) {
  return prisma.qceTask.findMany({
    where: buildContactTaskWhere(orgId, ids),
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
  });
}

async function loadNotes(orgId: string, ids: ContactRollupIds) {
  return prisma.qceNote.findMany({
    where: buildContactNoteWhere(orgId, ids),
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function loadCallLogs(orgId: string, leadId: string | null) {
  if (!leadId) return [];
  return prisma.qceCallLog.findMany({
    where: { orgId, leadId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function loadAttachments(orgId: string, contactId: string) {
  return prisma.qceDocument.findMany({
    where: {
      orgId,
      refType: "contact",
      refId: contactId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFullContactRecord(opts: {
  user: SessionUser;
  contactId: string;
}): Promise<FullContactRecord | null> {
  const { user, contactId } = opts;

  const c = await prisma.qceContact.findFirst({
    where: { id: contactId, orgId: user.orgId },
    include: {
      account: { select: { id: true, name: true } },
      lead: { select: { id: true, name: true, company: true } },
    },
  });
  if (!c) return null;

  const rollupIds: ContactRollupIds = {
    contactId,
    leadId: c.leadId,
    accountId: c.accountId,
  };

  const opportunitiesPromise = c.accountId
    ? prisma.qceOpportunity.findMany({
        where: {
          orgId: user.orgId,
          accountId: c.accountId,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    : Promise.resolve([]);

  const [opportunities, activities, tasks, notes, callLogs, attachments] = await Promise.all([
    opportunitiesPromise,
    loadActivities(user.orgId, rollupIds),
    loadTasks(user.orgId, rollupIds),
    loadNotes(user.orgId, rollupIds),
    loadCallLogs(user.orgId, c.leadId),
    loadAttachments(user.orgId, contactId),
  ]);

  const contact = toContact360Row(c);
  const snapshot = buildContactDashboardSnapshot({
    opportunities,
    tasks,
    activities,
    callLogs,
    notes,
    attachments,
  });

  return {
    contact,
    account: c.account ? { id: c.account.id, name: c.account.name } : null,
    lead: c.lead
      ? { id: c.lead.id, name: c.lead.name, company: c.lead.company }
      : null,
    snapshot,
    opportunities,
    activities,
    tasks,
    notes,
    callLogs,
    attachments,
  };
}
