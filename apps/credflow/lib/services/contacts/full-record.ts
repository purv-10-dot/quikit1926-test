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

async function loadActivities(tenantId: string, ids: ContactRollupIds) {
  return prisma.qcfActivity.findMany({
    where: buildContactActivityWhere(tenantId, ids),
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}

async function loadTasks(tenantId: string, ids: ContactRollupIds) {
  return prisma.qcfTask.findMany({
    where: buildContactTaskWhere(tenantId, ids),
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
  });
}

async function loadNotes(tenantId: string, ids: ContactRollupIds) {
  return prisma.qcfNote.findMany({
    where: buildContactNoteWhere(tenantId, ids),
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function loadCallLogs(tenantId: string, leadId: string | null) {
  if (!leadId) return [];
  return prisma.qcfCallLog.findMany({
    where: { tenantId, leadId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function loadAttachments(tenantId: string, contactId: string) {
  return prisma.qcfDocument.findMany({
    where: {
      tenantId,
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

  const c = await prisma.qcfContact.findFirst({
    where: { id: contactId, tenantId: user.tenantId },
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
    ? prisma.qcfOpportunity.findMany({
        where: {
          tenantId: user.tenantId,
          accountId: c.accountId,
          deletedAt: null,
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      })
    : Promise.resolve([]);

  const [opportunities, activities, tasks, notes, callLogs, attachments] = await Promise.all([
    opportunitiesPromise,
    loadActivities(user.tenantId, rollupIds),
    loadTasks(user.tenantId, rollupIds),
    loadNotes(user.tenantId, rollupIds),
    loadCallLogs(user.tenantId, c.leadId),
    loadAttachments(user.tenantId, contactId),
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
