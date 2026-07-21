/**
 * POST /api/email/send
 *
 * Sends an email FROM the current user's connected mailbox, attached to a
 * Lead/Contact/Account/Opportunity, then records the CrmEmailMessage + thread +
 * timeline CrmActivity. Reply threading is preserved via In-Reply-To/References.
 *
 * Auth: requireApiUser (own mailbox only) + assertModule(activities, create).
 * Every query is orgId-scoped; the mailbox is resolved by (orgId, userId) so a
 * user can never send from another user's mailbox.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { sendEmailSchema } from "@/lib/validators/email";
import { assertActivityTargetExists } from "@/lib/services/activities/target-existence";
import { getActiveConnection, withFreshToken } from "@/lib/services/email/mailbox";
import { getProvider } from "@/lib/services/email/providers";
import { persistMessage } from "@/lib/services/email/persist";
import { upsertMailboxEmail, linkMailboxEmailToCrm } from "@/lib/services/email/mailbox-store";
import type { NormalizedMessage } from "@/lib/services/email/providers/types";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "activities", "create");

    const parsed = sendEmailSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Record must exist in this org (also serves as tenant-isolation guard).
    await assertActivityTargetExists(user.orgId, input.relatedKind, input.relatedObjectId);

    const conn = await getActiveConnection(user.orgId, user.userId);

    // If replying, resolve the prior message (org-scoped) for threading.
    let inReplyToRfcId: string | undefined;
    let providerThreadId: string | undefined;
    let inReplyToProviderMessageId: string | undefined;
    if (input.inReplyToMessageId) {
      const prior = await prisma.crmEmailMessage.findFirst({
        where: { id: input.inReplyToMessageId, orgId: user.orgId, mailboxConnectionId: conn.id },
        select: {
          rfcMessageId: true,
          providerMessageId: true,
          thread: { select: { providerThreadId: true } },
        },
      });
      inReplyToRfcId = prior?.rfcMessageId ?? undefined;
      providerThreadId = prior?.thread?.providerThreadId ?? undefined;
      // The provider message id lets Graph createReply keep the conversation.
      inReplyToProviderMessageId = prior?.providerMessageId ?? undefined;
    }

    const provider = getProvider(conn.provider);
    const sent = await withFreshToken(conn, (ctx) =>
      provider.sendMessage(ctx, {
        fromAddress: conn.emailAddress,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        inReplyToRfcId,
        providerThreadId,
        inReplyToProviderMessageId,
        attachments: input.attachments,
      }),
    );

    const persisted = await persistMessage({
      orgId: user.orgId,
      mailboxConnectionId: conn.id,
      userId: user.userId,
      provider: conn.provider,
      providerMessageId: sent.providerMessageId,
      providerThreadId: sent.providerThreadId,
      rfcMessageId: sent.rfcMessageId,
      inReplyTo: inReplyToRfcId,
      direction: "outbound",
      fromAddress: conn.emailAddress,
      toAddresses: input.to,
      ccAddresses: input.cc,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      timestamp: new Date(),
      relatedKind: input.relatedKind,
      relatedObjectId: input.relatedObjectId,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        mimeType: a.mimeType,
        sizeBytes: Math.floor((a.contentBase64.length * 3) / 4),
      })),
    });

    // Immediately mirror the sent email into CrmMailboxEmail so it shows in the
    // Mailbox (Sent / All) right away — no waiting for "Sync now" or the cron.
    // Reuses the SAME upsert the sync uses; dedupe is by providerMessageId, so
    // when the sync later pulls this message back from Sent Items it is a no-op.
    // Best-effort: a mirror hiccup must not fail the send (the sync backfills it).
    try {
      const now = new Date();
      const sentMirror: NormalizedMessage = {
        providerMessageId: sent.providerMessageId,
        providerThreadId: sent.providerThreadId,
        rfcMessageId: sent.rfcMessageId,
        inReplyTo: inReplyToRfcId,
        direction: "outbound",
        folder: "sent",
        fromAddress: conn.emailAddress,
        toAddresses: input.to,
        ccAddresses: input.cc,
        bccAddresses: input.bcc,
        subject: input.subject,
        snippet: "",
        bodyHtml: input.bodyHtml,
        timestamp: now,
        isRead: true, // sent mail is read by definition
        attachments: (input.attachments ?? []).map((a) => ({
          providerAttachmentId: "", // provider id unknown pre-sync; sync reconciles
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: Math.floor((a.contentBase64.length * 3) / 4),
        })),
      };
      const mirror = await upsertMailboxEmail(conn, sentMirror);
      // Cross-link the mirror row to its CRM-matched message (same as the sync).
      if (mirror.created) {
        await linkMailboxEmailToCrm(
          mirror.id,
          persisted.messageId,
          input.relatedKind,
          input.relatedObjectId,
        );
      }
    } catch (mirrorErr) {
      console.warn(
        "[email:send] mailbox mirror write failed (sync will backfill):",
        mirrorErr instanceof Error ? mirrorErr.message : mirrorErr,
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          messageId: persisted.messageId,
          threadId: persisted.threadId,
          activityId: persisted.activityId,
        },
      },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
