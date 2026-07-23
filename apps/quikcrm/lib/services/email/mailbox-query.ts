/**
 * Read-side queries for the Mailbox module. UI reads the local DB ONLY — these
 * never call the provider. All queries are scoped to (orgId, the caller's own
 * mailboxConnectionId) so a user only ever sees their own mailbox.
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { getConnection } from "./mailbox";

export type MailboxFolder = "inbox" | "sent" | "drafts" | "all";

export interface MailboxListParams {
  folder: MailboxFolder;
  page: number;
  pageSize: number;
  q?: string;
  isRead?: boolean;
  hasAttachment?: boolean;
}

/** The mirror's `provider` column value for a connection's provider. */
function providerLabel(provider: string): string {
  return provider === "gmail" ? "google" : provider;
}

/** Resolve the caller's active connection (id + provider label), or null. */
export async function callerConnection(
  orgId: string,
  userId: string,
): Promise<{ id: string; provider: string } | null> {
  const conn = await getConnection(orgId, userId);
  if (!conn || conn.status === "disconnected") return null;
  return { id: conn.id, provider: providerLabel(conn.provider) };
}

/** Resolve the caller's connection id, or null if they have none. */
export async function callerConnectionId(orgId: string, userId: string): Promise<string | null> {
  return (await callerConnection(orgId, userId))?.id ?? null;
}

/** List columns — deliberately excludes the full body (list views stay light). */
const LIST_SELECT = {
  id: true,
  provider: true,
  folder: true,
  direction: true,
  fromAddress: true,
  fromName: true,
  toAddresses: true,
  subject: true,
  preview: true,
  hasAttachments: true,
  isRead: true,
  isStarred: true,
  receivedAt: true,
  sentAt: true,
  createdAt: true,
} satisfies Prisma.CrmMailboxEmailSelect;

function buildWhere(
  orgId: string,
  connectionId: string,
  params: MailboxListParams,
  provider?: string,
): Prisma.CrmMailboxEmailWhereInput {
  const where: Prisma.CrmMailboxEmailWhereInput = {
    orgId,
    mailboxConnectionId: connectionId,
    // Defense-in-depth: a connection has exactly one provider, so pinning it
    // guarantees no cross-provider row can surface even if a stale mirror row
    // ever shares this connection id.
    ...(provider ? { provider } : {}),
  };
  if (params.folder !== "all") where.folder = params.folder;
  if (typeof params.isRead === "boolean") where.isRead = params.isRead;
  if (params.hasAttachment) where.hasAttachments = true;
  if (params.q && params.q.trim()) {
    const q = params.q.trim();
    where.OR = [
      { subject: { contains: q, mode: "insensitive" } },
      { fromAddress: { contains: q, mode: "insensitive" } },
      { fromName: { contains: q, mode: "insensitive" } },
      { preview: { contains: q, mode: "insensitive" } },
      { bodyText: { contains: q, mode: "insensitive" } },
      { toAddresses: { has: q.toLowerCase() } },
    ];
  }
  return where;
}

export async function listMailboxEmails(
  orgId: string,
  connectionId: string,
  params: MailboxListParams,
  provider?: string,
): Promise<{ items: unknown[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const where = buildWhere(orgId, connectionId, params, provider);
  // Newest first — use the folder's natural timestamp (received for inbox,
  // sent for sent/drafts) via a coalesced order on both.
  const [items, total] = await Promise.all([
    prisma.crmMailboxEmail.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ receivedAt: "desc" }, { sentAt: "desc" }, { createdAt: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    prisma.crmMailboxEmail.count({ where }),
  ]);
  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** Full detail for one email + its thread (same providerThreadId), org+conn scoped. */
export async function getMailboxEmail(orgId: string, connectionId: string, id: string) {
  const email = await prisma.crmMailboxEmail.findFirst({
    where: { id, orgId, mailboxConnectionId: connectionId },
  });
  if (!email) return null;

  const thread = email.providerThreadId
    ? await prisma.crmMailboxEmail.findMany({
        where: {
          orgId,
          mailboxConnectionId: connectionId,
          providerThreadId: email.providerThreadId,
        },
        orderBy: [{ receivedAt: "asc" }, { sentAt: "asc" }, { createdAt: "asc" }],
        select: { ...LIST_SELECT, bodyHtml: true, bodyText: true, ccAddresses: true, bccAddresses: true, attachments: true },
      })
    : [email];

  return { email, thread };
}

export async function unreadCount(orgId: string, connectionId: string): Promise<number> {
  return prisma.crmMailboxEmail.count({
    where: { orgId, mailboxConnectionId: connectionId, folder: "inbox", isRead: false },
  });
}

export async function markRead(orgId: string, connectionId: string, id: string): Promise<void> {
  await prisma.crmMailboxEmail.updateMany({
    where: { id, orgId, mailboxConnectionId: connectionId, isRead: false },
    data: { isRead: true },
  });
}
