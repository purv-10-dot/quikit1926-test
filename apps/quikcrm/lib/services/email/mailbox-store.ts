/**
 * Raw mailbox mirror writer (P3 Mailbox module).
 *
 * `upsertMailboxEmail()` stores EVERY fetched email into CrmMailboxEmail —
 * unlike the CRM-matched path (persistMessage), which only stores mail tied to a
 * record. This is what makes the in-CRM Mailbox a complete client: the UI reads
 * this table only, never the provider.
 *
 * Dedupe is guaranteed by @@unique([orgId, mailboxConnectionId, providerMessageId]).
 * On a re-sync we SKIP an existing row unless a mutable flag (isRead / isStarred
 * / labels / folder) actually changed — then we do a cheap flag-only update. We
 * never rewrite the body of an already-stored email.
 *
 * Bodies are stored inline but capped so a giant newsletter can't bloat a row.
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import type { NormalizedMessage } from "./providers/types";
import type { CrmMailboxConnection } from "@quikit/database";

/** Max stored size per body (chars). Truncated bodies keep the preview intact. */
const BODY_CAP = 256 * 1024;

/** google/microsoft — the mirror's `provider` column value. */
function providerLabel(provider: string): string {
  return provider === "gmail" ? "google" : provider;
}

function cap(s: string | undefined | null): string | null {
  if (!s) return null;
  return s.length > BODY_CAP ? s.slice(0, BODY_CAP) : s;
}

function preview(msg: NormalizedMessage): string {
  const base = msg.snippet || msg.bodyText || "";
  return base.replace(/\s+/g, " ").trim().slice(0, 280);
}

export interface UpsertMailboxResult {
  id: string;
  created: boolean;
}

/**
 * Insert the email if new; otherwise flag-diff update only. Returns the row id
 * and whether it was newly created (the sync loop uses `created` for counters).
 */
export async function upsertMailboxEmail(
  conn: CrmMailboxConnection,
  msg: NormalizedMessage,
): Promise<UpsertMailboxResult> {
  const existing = await prisma.crmMailboxEmail.findUnique({
    where: {
      orgId_mailboxConnectionId_providerMessageId: {
        orgId: conn.orgId,
        mailboxConnectionId: conn.id,
        providerMessageId: msg.providerMessageId,
      },
    },
    select: { id: true, isRead: true, isStarred: true, folder: true, labels: true },
  });

  if (existing) {
    // "Do not update unless changed" — only the cheap mutable flags.
    const nextRead = msg.isRead ?? existing.isRead;
    const nextStarred = msg.isStarred ?? existing.isStarred;
    const nextFolder = msg.folder ?? existing.folder;
    const nextLabels = msg.labels ?? existing.labels;
    const labelsChanged =
      nextLabels.length !== existing.labels.length ||
      nextLabels.some((l, i) => l !== existing.labels[i]);
    if (
      nextRead !== existing.isRead ||
      nextStarred !== existing.isStarred ||
      nextFolder !== existing.folder ||
      labelsChanged
    ) {
      await prisma.crmMailboxEmail.update({
        where: { id: existing.id },
        data: {
          isRead: nextRead,
          isStarred: nextStarred,
          folder: nextFolder,
          labels: nextLabels,
          syncedAt: new Date(),
        },
      });
    }
    return { id: existing.id, created: false };
  }

  const attachmentsJson =
    msg.attachments.length > 0
      ? (msg.attachments.map((a) => ({
          filename: a.filename,
          mimeType: a.mimeType ?? null,
          sizeBytes: a.sizeBytes ?? null,
          providerAttachmentId: a.providerAttachmentId,
        })) as unknown as Prisma.InputJsonValue)
      : undefined;

  const row = await prisma.crmMailboxEmail.create({
    data: {
      orgId: conn.orgId,
      mailboxConnectionId: conn.id,
      provider: providerLabel(conn.provider),
      providerMessageId: msg.providerMessageId,
      providerThreadId: msg.providerThreadId ?? null,
      folder: msg.folder ?? (msg.direction === "outbound" ? "sent" : "inbox"),
      direction: msg.direction,
      fromAddress: msg.fromAddress,
      fromName: msg.fromName ?? null,
      toAddresses: msg.toAddresses,
      ccAddresses: msg.ccAddresses,
      bccAddresses: msg.bccAddresses ?? [],
      subject: msg.subject || null,
      preview: preview(msg),
      bodyHtml: cap(msg.bodyHtml),
      bodyText: cap(msg.bodyText),
      hasAttachments: msg.attachments.length > 0,
      attachments: attachmentsJson,
      receivedAt: msg.direction === "inbound" ? msg.timestamp : null,
      sentAt: msg.direction === "outbound" ? msg.timestamp : null,
      isRead: msg.isRead ?? (msg.direction === "outbound"), // sent/drafts read by default
      isStarred: msg.isStarred ?? false,
      labels: msg.labels ?? [],
    },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

/** Backfill the CRM cross-link onto the mirror row once an email is matched. */
export async function linkMailboxEmailToCrm(
  mailboxEmailId: string,
  crmEmailMessageId: string,
  matchedKind: string,
  matchedObjectId: string,
): Promise<void> {
  await prisma.crmMailboxEmail
    .update({
      where: { id: mailboxEmailId },
      data: { crmEmailMessageId, matchedKind, matchedObjectId },
    })
    .catch(() => {
      // Non-fatal: the mirror row exists regardless of the cross-link.
    });
}
