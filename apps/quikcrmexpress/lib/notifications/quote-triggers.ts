/**
 * Quote notification triggers — immediate events.
 *
 * Runs AFTER the quote service and rules engine. Never touches existing
 * lead, task, or opportunity notifications.
 *
 * ─── Events ──────────────────────────────────────────────────────────────────
 *
 *  notifyQuoteCreated()   → Sales Managers + Owner (if different from actor)
 *  notifyQuoteSent()      → Sales Managers + Owner (if different from actor)
 *  notifyQuoteApproved()  → requestedById (person who requested approval)
 *  notifyQuoteRejected()  → requestedById (person who requested approval)
 *
 * ─── Schema note ─────────────────────────────────────────────────────────────
 *  QceQuote.ownerId         → nullable, set on quote creation
 *  QceQuote.createdByUserId → nullable, the user who created the quote
 *  QceQuoteApproval.requestedById → person who called POST .../approval/request
 *  QceQuoteApproval.decidedById   → person who called POST .../approval/decide
 */

import { prisma } from "@/lib/db/prisma";
import { createNotification } from "@/lib/notifications/service";

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getSalesManagers(
  orgId: string,
  excludeUserId: string,
): Promise<string[]> {
  const members = await prisma.orgMember.findMany({
    where: {
      orgId: orgId,
      status: "active",
      role: {
        in: [
          "SalesManager", "Administrator",
          "manager", "admin", "org_admin",
        ],
      },
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId).filter((id) => id !== excludeUserId);
}

// ─── Quote Created ────────────────────────────────────────────────────────────

export interface QuoteCreatedParams {
  orgId: string;
  quoteId: string;
  quoteNumber: string;
  ownerId: string | null | undefined;
  actorUserId: string;
  actorName: string;
}

/**
 * Notify sales managers (and the owner if different from the creator) when a
 * new quote is created. The creator already knows — suppress their notification.
 */
export async function notifyQuoteCreated(p: QuoteCreatedParams): Promise<void> {
  const managers = await getSalesManagers(p.orgId, p.actorUserId);
  const recipients = new Set(managers);
  if (p.ownerId && p.ownerId !== p.actorUserId) recipients.add(p.ownerId);

  if (recipients.size === 0) return;

  await Promise.allSettled(
    [...recipients].map((userId) =>
      createNotification({
        orgId: p.orgId,
        userId,
        type: "lead_assigned",
        category: "lead",
        title: "New quote created",
        body: `Quote ${p.quoteNumber} was created by ${p.actorName}.`,
        link: `/quotes/${p.quoteId}`,
        metadata: {
          type: "quote_created",
          quoteId: p.quoteId,
          quoteNumber: p.quoteNumber,
          createdByName: p.actorName,
        },
      }),
    ),
  );
}

// ─── Quote Sent ───────────────────────────────────────────────────────────────

export interface QuoteSentParams {
  orgId: string;
  quoteId: string;
  quoteNumber: string;
  ownerId: string | null | undefined;
  actorUserId: string;
  actorName: string;
  recipientEmails: string[];
}

/**
 * Notify sales managers (and the owner if different) when a quote is sent to
 * the customer. Includes the recipient email(s) in the notification body.
 */
export async function notifyQuoteSent(p: QuoteSentParams): Promise<void> {
  const managers = await getSalesManagers(p.orgId, p.actorUserId);
  const recipients = new Set(managers);
  if (p.ownerId && p.ownerId !== p.actorUserId) recipients.add(p.ownerId);

  if (recipients.size === 0) return;

  const toLine =
    p.recipientEmails.length > 0
      ? ` to ${p.recipientEmails.slice(0, 2).join(", ")}${p.recipientEmails.length > 2 ? " …" : ""}`
      : "";

  await Promise.allSettled(
    [...recipients].map((userId) =>
      createNotification({
        orgId: p.orgId,
        userId,
        type: "lead_stage_changed",
        category: "lead",
        title: "Quote sent to customer",
        body: `Quote ${p.quoteNumber} was sent${toLine} by ${p.actorName}.`,
        link: `/quotes/${p.quoteId}`,
        metadata: {
          type: "quote_sent",
          quoteId: p.quoteId,
          quoteNumber: p.quoteNumber,
          sentByName: p.actorName,
          recipientEmails: p.recipientEmails,
        },
      }),
    ),
  );
}

// ─── Quote Approved ───────────────────────────────────────────────────────────

export interface QuoteApprovedParams {
  orgId: string;
  quoteId: string;
  quoteNumber: string;
  /** The user who originally requested approval — fetched from QceQuoteApproval. */
  requestedById: string | null | undefined;
  /** Name of the approver (actor who called /decide). */
  approverName: string;
  notes: string | null | undefined;
}

/**
 * Notify the person who requested approval when their quote is approved.
 * Recipient: QceQuoteApproval.requestedById
 */
export async function notifyQuoteApproved(p: QuoteApprovedParams): Promise<void> {
  if (!p.requestedById) return;

  const notesLine = p.notes ? ` Notes: "${p.notes}".` : "";
  await createNotification({
    orgId: p.orgId,
    userId: p.requestedById,
    type: "lead_converted",
    category: "lead",
    title: "Quote approved ✓",
    body: `Quote ${p.quoteNumber} was approved by ${p.approverName}.${notesLine} You can now send it to the customer.`,
    link: `/quotes/${p.quoteId}`,
    metadata: {
      type: "quote_approved",
      quoteId: p.quoteId,
      quoteNumber: p.quoteNumber,
      approverName: p.approverName,
      notes: p.notes,
    },
  });
}

// ─── Quote Rejected ───────────────────────────────────────────────────────────

export interface QuoteRejectedParams {
  orgId: string;
  quoteId: string;
  quoteNumber: string;
  /** The user who originally requested approval. */
  requestedById: string | null | undefined;
  /** Name of the approver who rejected. */
  approverName: string;
  notes: string | null | undefined;
}

/**
 * Notify the requester when their approval request is rejected.
 * Recipient: QceQuoteApproval.requestedById
 */
export async function notifyQuoteRejected(p: QuoteRejectedParams): Promise<void> {
  if (!p.requestedById) return;

  const notesLine = p.notes ? ` Reason: "${p.notes}".` : "";
  await createNotification({
    orgId: p.orgId,
    userId: p.requestedById,
    type: "lead_reassigned",
    category: "lead",
    title: "Quote approval rejected",
    body: `Quote ${p.quoteNumber} was rejected by ${p.approverName}.${notesLine} Please revise and re-submit.`,
    link: `/quotes/${p.quoteId}`,
    metadata: {
      type: "quote_rejected",
      quoteId: p.quoteId,
      quoteNumber: p.quoteNumber,
      approverName: p.approverName,
      notes: p.notes,
    },
  });
}
