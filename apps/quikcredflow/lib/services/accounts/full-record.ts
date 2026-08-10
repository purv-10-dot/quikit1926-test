/**
 * Aggregator for the account 360 page and GET /api/accounts/[id]/full.
 */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { findFirstAccountRow, type AccountRow } from "@/lib/services/accounts";
import { buildAccountDashboardSnapshot } from "@/lib/services/accounts/dashboard-snapshot";
import {
  buildAccountScoreHistory,
  type AccountScoreHistoryBundle,
} from "@/lib/services/accounts/account-score-history";
import { decodeAccountNoteContent } from "@/lib/accounts/account-note-category";
import {
  buildAccountActivityWhere,
  buildAccountNoteWhere,
  buildAccountTaskWhere,
  type AccountRollupIds,
} from "@/lib/services/accounts/rollup-where";

export type AccountDashboardNote = {
  id: string;
  content: string;
  noteCategory: "internal" | "strategy" | "meeting" | "risk";
  createdAt: string;
};

export interface FullAccountRecord {
  account: AccountRow;
  parent: { id: string; name: string } | null;
  subsidiaries: { id: string; name: string; status: string | null }[];
  snapshot: ReturnType<typeof buildAccountDashboardSnapshot>;
  leads: {
    id: string;
    name: string;
    stage: string;
    status: string;
    ownerName: string | null;
    ownerId: string | null;
  }[];
  contacts: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    ownerName: string | null;
  }[];
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
  quotes: {
    id: string;
    quoteNumber: string;
    status: string;
    grandTotal: unknown;
    currency: string;
    sentAt: Date | null;
    createdAt: Date;
  }[];
  activities: Awaited<ReturnType<typeof loadActivities>>;
  tasks: Awaited<ReturnType<typeof loadTasks>>;
  notes: AccountDashboardNote[];
  callLogs: Awaited<ReturnType<typeof loadCallLogs>>;
  attachments: Awaited<ReturnType<typeof loadAttachments>>;
  scoreHistory: AccountScoreHistoryBundle;
}

async function loadActivities(orgId: string, ids: AccountRollupIds) {
  return prisma.qcfActivity.findMany({
    where: buildAccountActivityWhere(orgId, ids),
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}

async function loadTasks(orgId: string, ids: AccountRollupIds) {
  return prisma.qcfTask.findMany({
    where: buildAccountTaskWhere(orgId, ids),
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    take: 100,
  });
}

async function loadNotes(orgId: string, ids: AccountRollupIds) {
  return prisma.qcfNote.findMany({
    where: buildAccountNoteWhere(orgId, ids),
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function loadCallLogs(orgId: string, leadIds: string[]) {
  if (leadIds.length === 0) return [];
  return prisma.qcfCallLog.findMany({
    where: { orgId, leadId: { in: leadIds } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

async function loadAttachments(orgId: string, accountId: string) {
  return prisma.qcfDocument.findMany({
    where: {
      orgId,
      refType: "account",
      refId: accountId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFullAccountRecord(opts: {
  user: SessionUser;
  accountId: string;
}): Promise<FullAccountRecord | null> {
  const { user, accountId } = opts;
  const account = await findFirstAccountRow({
    where: { id: accountId, orgId: user.orgId },
  });
  if (!account) return null;
  await assertAccountAccess(user, accountId);

  const [parent, subsidiaries, leads, contacts, opportunities, quotes] = await Promise.all([
    account.parentAccountId
      ? prisma.qcfAccount.findFirst({
          where: {
            id: account.parentAccountId,
            orgId: user.orgId,
            deletedAt: null,
          },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    prisma.qcfAccount.findMany({
      where: { orgId: user.orgId, parentAccountId: accountId, deletedAt: null },
      select: { id: true, name: true, status: true },
      orderBy: { name: "asc" },
      take: 50,
    }),
    prisma.qcfLead.findMany({
      where: { orgId: user.orgId, accountId, deletedAt: null },
      select: {
        id: true,
        name: true,
        stage: true,
        status: true,
        ownerName: true,
        ownerId: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.qcfContact.findMany({
      where: { orgId: user.orgId, accountId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        title: true,
        ownerName: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.qcfOpportunity.findMany({
      where: { orgId: user.orgId, accountId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    prisma.qcfQuote.findMany({
      where: { orgId: user.orgId, accountId },
      select: {
        id: true,
        quoteNumber: true,
        status: true,
        grandTotal: true,
        currency: true,
        sentAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  const rollupIds: AccountRollupIds = {
    accountId,
    leadIds: leads.map((l) => l.id),
    contactIds: contacts.map((c) => c.id),
    opportunityIds: opportunities.map((o) => o.id),
  };

  const [activities, tasks, notes, callLogs, attachments] = await Promise.all([
    loadActivities(user.orgId, rollupIds),
    loadTasks(user.orgId, rollupIds),
    loadNotes(user.orgId, rollupIds),
    loadCallLogs(user.orgId, rollupIds.leadIds),
    loadAttachments(user.orgId, accountId),
  ]);

  const snapshot = buildAccountDashboardSnapshot({
    renewalDate: account.renewalDate,
    opportunities,
    quotes,
    tasks,
    activities,
    callLogs,
    notes,
    attachments,
    contacts,
    leads,
  });

  const scoreHistory = buildAccountScoreHistory({
    healthScore: account.healthScore,
    activities: activities.map((a) => ({ at: a.occurredAt ?? a.createdAt })),
    calls: callLogs.map((c) => ({ at: c.startTime ?? c.createdAt })),
    notes: notes.map((n) => ({ at: n.createdAt })),
    opportunities: opportunities.map((o) => ({
      amount: o.amount,
      updatedAt: o.updatedAt,
      stage: o.stage,
    })),
  });

  const accountNotes = notes
    .filter(
      (n) =>
        n.relatedKind.toLowerCase() === "account" &&
        n.relatedObjectId === accountId,
    )
    .map((n) => {
      const decoded = decodeAccountNoteContent(n.content);
      return {
        id: n.id,
        content: decoded.body,
        noteCategory: decoded.category,
        createdAt: n.createdAt.toISOString(),
      };
    });

  return {
    account,
    parent,
    subsidiaries,
    snapshot,
    leads,
    contacts,
    opportunities,
    quotes,
    activities,
    tasks,
    notes: accountNotes,
    callLogs,
    attachments,
    scoreHistory,
  };
}
