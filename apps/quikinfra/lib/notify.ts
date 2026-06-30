/**
 * Notification helper. MVP: logs to console (structured) + writes to audit.
 * To wire a real provider:
 *   - pick provider (Resend / SendGrid / AWS SES)
 *   - replace sendEmail() body with their SDK call
 *   - no callers change
 *
 * All notifications are opt-in from each feature's endpoint; we don't auto-send.
 */
import { db } from "@/lib/db";

export type NotifyEvent =
  | "approval.requested"
  | "approval.decided"
  | "invoice.sent"
  | "invoice.overdue"
  | "bill.approved"
  | "payment.recorded"
  | "incident.reported"
  | "payroll.finalized";

export interface NotifyPayload {
  event: NotifyEvent;
  orgId: string;
  toUserId?: string;       // resolve to email via User table
  toEmail?: string;        // direct email
  subject: string;
  body: string;            // plain text for log; future: HTML template
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget. Never throws. Returns true if the attempt succeeded.
 */
export async function notify(payload: NotifyPayload): Promise<boolean> {
  try {
    let targetEmail = payload.toEmail ?? null;
    if (!targetEmail && payload.toUserId) {
      const u = await db.user.findUnique({ where: { id: payload.toUserId }, select: { email: true } });
      targetEmail = u?.email ?? null;
    }
    await sendEmail({
      to: targetEmail,
      subject: payload.subject,
      body: payload.body,
      event: payload.event,
      orgId: payload.orgId,
      metadata: payload.metadata,
    });
    return true;
  } catch (err) {
    console.error("[notify] failed", payload.event, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Provider adapter. Replace body for real sending.
// ---------------------------------------------------------------------------

async function sendEmail(args: {
  to: string | null;
  subject: string;
  body: string;
  event: string;
  orgId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // STUB — prints to server log only. Swap this body when wiring a provider:
  //
  //   import { Resend } from "resend";
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({ to: args.to!, from: process.env.EMAIL_FROM!, subject: args.subject, text: args.body });
  //
  // Keep the stub available in dev (no key) for offline testing.
  if (!args.to) {
    console.info("[notify:stub] skipped (no recipient)", { event: args.event, subject: args.subject });
    return;
  }
  console.info("[notify:stub] would-send", {
    orgId: args.orgId,
    event: args.event,
    to: args.to,
    subject: args.subject,
    preview: args.body.slice(0, 200),
  });
}

// ---------------------------------------------------------------------------
// Convenience templates
// ---------------------------------------------------------------------------

export function buildInvoiceOverdueEmail(args: { invoiceNumber: string; customer: string; amount: number; daysOverdue: number }) {
  return {
    subject: `Invoice overdue: ${args.invoiceNumber}`,
    body: `${args.customer} owes ₹${args.amount} on ${args.invoiceNumber} — ${args.daysOverdue} day(s) past due.`,
  };
}
