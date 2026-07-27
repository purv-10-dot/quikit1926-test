/**
 * Notification delivery — honest, app-native in-app notifications.
 *
 * There is NO dedicated `Notification` model in the Prisma schema. The app's
 * existing in-app notification mechanism is the Message/Conversation system
 * (the user inbox). So a nudge/congratulation is delivered as a real Message
 * row in a direct conversation between the sender (manager) and the target
 * learner — exactly what the learner sees in their inbox.
 *
 * In addition we:
 *  - record a TenantLog audit row (e.g. UserNudgedByManager), and
 *  - queue an email via lib/email.ts sendEmail (which gracefully no-ops when
 *    SMTP/Resend is not configured).
 *
 * Every step is best-effort per-recipient but the function only counts a
 * recipient as delivered once an in-app Message row has actually been created.
 */
import type { LmsTenantActionType as TenantActionType } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';

const FRONTEND_URL = process.env.NEXTAUTH_URL || 'http://localhost:3014';

/** Escape text destined for email HTML. */
function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Find an existing direct conversation between two users in a tenant, or create
 * one. Mirrors the messages-service direct-conversation logic but without the
 * role-pair gate (manager↔learner is an internal system delivery channel).
 */
async function getOrCreateDirectConversation(
  orgId: string,
  senderId: string,
  recipientId: string,
): Promise<string> {
  const candidates = await db.lmsConversation.findMany({
    where: {
      orgId,
      type: 'direct',
      AND: [
        { participants: { some: { userId: senderId } } },
        { participants: { some: { userId: recipientId } } },
      ],
    },
    include: { participants: { select: { userId: true } } },
  });
  const existing = candidates.find((c) => c.participants.length === 2);
  if (existing) {
    // Un-archive / un-delete for both sides so the message surfaces.
    await db.lmsConversationParticipant.updateMany({
      where: { conversationId: existing.id },
      data: { isDeleted: false, isArchived: false },
    });
    return existing.id;
  }

  const conversation = await db.lmsConversation.create({
    data: {
      orgId,
      type: 'direct',
      createdBy: senderId,
      participants: {
        create: [
          { userId: senderId, role: 'admin' },
          { userId: recipientId, role: 'member' },
        ],
      },
    },
    select: { id: true },
  });
  return conversation.id;
}

/** Persist an in-app message to one recipient. Returns true on success. */
async function deliverInApp(
  orgId: string,
  senderId: string,
  recipientId: string,
  text: string,
): Promise<boolean> {
  const conversationId = await getOrCreateDirectConversation(orgId, senderId, recipientId);
  await db.lmsMessage.create({
    data: { conversationId, senderId, text: text.slice(0, 2000) },
  });
  await db.lmsConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: text.slice(0, 100),
      lastMessageAt: new Date(),
      lastMessageBy: senderId,
      messageCount: { increment: 1 },
    },
  });
  return true;
}

export interface NudgeRecipient {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface NotifyOptions {
  orgId: string;
  senderId: string;
  recipients: NudgeRecipient[];
  /** In-app + plain-text email body. */
  message: string;
  /** Email subject line. */
  subject: string;
  /** TenantLog action to record (omit to skip audit). */
  auditAction?: TenantActionType;
}

export interface NotifyResult {
  /** Number of recipients that actually received an in-app notification. */
  deliveredCount: number;
}

/**
 * Deliver a notification to each recipient: in-app message (authoritative),
 * email (best-effort), and a single tenant audit log. Only recipients with a
 * persisted in-app message are counted as delivered.
 */
export async function notifyUsers(opts: NotifyOptions): Promise<NotifyResult> {
  const { orgId, senderId, recipients, message, subject, auditAction } = opts;
  let deliveredCount = 0;

  for (const r of recipients) {
    try {
      const ok = await deliverInApp(orgId, senderId, r.id, message);
      if (ok) deliveredCount++;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notify] in-app delivery failed for', r.id, err);
      continue; // do not count, do not email a failed delivery
    }

    // Best-effort email (no-ops when SMTP/Resend unset).
    try {
      await sendEmail({
        to: r.email,
        subject,
        // Escaped: `message` is caller-supplied and, since the manager nudge
        // endpoints accept a free-text `{message}` body, it is USER input on its
        // way into email HTML. Every caller passes plain text, so escaping
        // changes nothing they rely on and closes the injection.
        html: `<p>Hi ${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)},</p><p>${escapeHtml(message)}</p>` +
          `<p><a href="${FRONTEND_URL}">Open QuikSkill</a></p>`,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[notify] email send failed (non-fatal) for', r.email, err);
    }
  }

  if (auditAction && deliveredCount > 0) {
    try {
      await db.lmsTenantLog.create({
        data: {
          orgId,
          actionType: auditAction,
          description: `${subject} — delivered to ${deliveredCount} user(s)`,
          performedBy: senderId,
          metadata: { recipientIds: recipients.map((r) => r.id), deliveredCount },
        },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[notify] tenant audit log failed (non-fatal)', err);
    }
  }

  return { deliveredCount };
}
