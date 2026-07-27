/**
 * Persist a mailbox message into the CRM: thread + message row + a CrmActivity
 * timeline entry, atomically. Shared by the send route (outbound) and the sync
 * poller (inbound + sent-item catch-up) so there is ONE write path and one
 * dedupe rule.
 *
 * Dedupe: CrmEmailMessage has @@unique([orgId, mailboxConnectionId,
 * providerMessageId]); logActivity() upserts on
 * @@unique([orgId, sourceSystem, externalId]). Re-running a sync therefore
 * never creates duplicate messages OR duplicate timeline activities.
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { logActivity } from "@/lib/services/activities/log-activity";
import { htmlToText } from "./providers/mime";

export interface PersistMessageInput {
  orgId: string;
  mailboxConnectionId: string;
  /** The user who owns the mailbox — becomes the activity owner. */
  userId: string;
  provider: string; // "gmail" | "microsoft" — used as activity sourceSystem
  providerMessageId: string;
  providerThreadId: string;
  rfcMessageId?: string;
  inReplyTo?: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddresses: string[];
  ccAddresses: string[];
  subject: string;
  snippet?: string;
  bodyHtml?: string;
  bodyText?: string;
  timestamp: Date;
  relatedKind: string;
  relatedObjectId: string;
  attachments?: {
    providerAttachmentId?: string;
    filename: string;
    mimeType?: string;
    sizeBytes?: number;
  }[];
}

export interface PersistResult {
  messageId: string;
  threadId: string;
  activityId: string;
  /** False when the message already existed (dedupe hit) — nothing new written. */
  created: boolean;
}

export async function persistMessage(input: PersistMessageInput): Promise<PersistResult> {
  // Fast dedupe check outside the transaction (the unique index is the real guard).
  const existing = await prisma.crmEmailMessage.findUnique({
    where: {
      orgId_mailboxConnectionId_providerMessageId: {
        orgId: input.orgId,
        mailboxConnectionId: input.mailboxConnectionId,
        providerMessageId: input.providerMessageId,
      },
    },
    select: { id: true, threadId: true, activityId: true },
  });
  if (existing) {
    return {
      messageId: existing.id,
      threadId: existing.threadId,
      activityId: existing.activityId ?? "",
      created: false,
    };
  }

  const snippet = input.snippet ?? (input.bodyText ?? htmlToText(input.bodyHtml ?? "")).slice(0, 200);
  const occurredAt = input.timestamp;
  const directionVerb = input.direction === "outbound" ? "Email Sent" : "Email Received";
  const subjectForActivity = input.subject || "(no subject)";

  return prisma.$transaction(async (tx) => {
    // 1. Upsert the thread (dedupe on providerThreadId per mailbox).
    const thread = await tx.crmEmailThread.upsert({
      where: {
        orgId_mailboxConnectionId_providerThreadId: {
          orgId: input.orgId,
          mailboxConnectionId: input.mailboxConnectionId,
          providerThreadId: input.providerThreadId,
        },
      },
      create: {
        orgId: input.orgId,
        mailboxConnectionId: input.mailboxConnectionId,
        providerThreadId: input.providerThreadId,
        subject: input.subject,
        relatedKind: input.relatedKind,
        relatedObjectId: input.relatedObjectId,
        lastMessageAt: occurredAt,
        messageCount: 1,
      },
      update: {
        lastMessageAt: occurredAt,
        messageCount: { increment: 1 },
      },
    });

    // 2. Timeline activity (reuses the shared, idempotent logActivity path).
    const activity = await logActivity({
      orgId: input.orgId,
      userId: input.userId,
      type: "email",
      relatedKind: input.relatedKind as "Lead" | "Opportunity" | "Contact" | "Account",
      relatedObjectId: input.relatedObjectId,
      subject: `${directionVerb}: ${subjectForActivity}`,
      outcome: input.direction === "outbound" ? "Sent" : "Received",
      occurredAt,
      sourceSystem: input.provider,
      externalId: input.providerMessageId,
      detailNotes: snippet,
      tx: tx as unknown as Prisma.TransactionClient,
    });

    // 3. The message row.
    const message = await tx.crmEmailMessage.create({
      data: {
        orgId: input.orgId,
        mailboxConnectionId: input.mailboxConnectionId,
        threadId: thread.id,
        providerMessageId: input.providerMessageId,
        rfcMessageId: input.rfcMessageId ?? null,
        inReplyTo: input.inReplyTo ?? null,
        direction: input.direction,
        fromAddress: input.fromAddress,
        toAddresses: input.toAddresses,
        ccAddresses: input.ccAddresses,
        subject: input.subject,
        snippet,
        bodyHtml: input.bodyHtml ?? null,
        bodyText: input.bodyText ?? null,
        sentAt: input.direction === "outbound" ? occurredAt : null,
        receivedAt: input.direction === "inbound" ? occurredAt : null,
        activityId: activity.id,
        relatedKind: input.relatedKind,
        relatedObjectId: input.relatedObjectId,
        ...(input.attachments?.length
          ? {
              attachments: {
                create: input.attachments.map((a) => ({
                  orgId: input.orgId,
                  filename: a.filename,
                  mimeType: a.mimeType ?? null,
                  sizeBytes: a.sizeBytes ?? null,
                  providerAttachmentId: a.providerAttachmentId ?? null,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });

    return { messageId: message.id, threadId: thread.id, activityId: activity.id, created: true };
  });
}
