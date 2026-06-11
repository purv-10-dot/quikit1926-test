/**
 * Quote state-machine.
 *
 * Statuses: Draft → Active → Won | Lost | Revised
 *
 *   Draft → Active   : "Activate" — pricing locks. Triggered by the rep.
 *   Active → Won     : "Mark Won" — customer accepted.
 *   Active → Lost    : "Mark Lost" — customer rejected. Requires reason.
 *   Active → Revised : handled by quote-service.reviseQuote (creates V2 Draft)
 *
 * Terminal states (Won/Lost/Revised) cannot be departed from. There is no
 * admin force escape hatch in v1 — if you need to amend a terminal quote,
 * Clone it.
 *
 * Each transition writes BOTH a CrmQuoteStatusTransition row and a
 * CrmActivity row so the audit log is queryable via either path.
 */
import type { CrmQuoteStatus, Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { serverlessTransaction } from "@/lib/db/transaction-options";

type DbClient = typeof db | Prisma.TransactionClient;

const ALLOWED: Record<CrmQuoteStatus, CrmQuoteStatus[]> = {
  Draft: ["Active"],
  // Revised is reached via reviseQuote, not this state machine.
  Active: ["Won", "Lost"],
  Won: [],
  Lost: [],
  Revised: [],
};

export class TransitionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface TransitionInput {
  toStatus: CrmQuoteStatus;
  reason?: string | null;
  notes?: string | null;
}

export function validateTransition(from: CrmQuoteStatus, input: TransitionInput): void {
  const { toStatus } = input;
  if (from === toStatus) {
    throw new TransitionError(`Quote is already ${toStatus}.`, 409);
  }
  if (!ALLOWED[from].includes(toStatus)) {
    throw new TransitionError(
      `Cannot transition Quote from ${from} to ${toStatus}.`,
      409,
    );
  }
  // Lost requires a reason for funnel cohort analysis. Won doesn't (we treat
  // the absence of a reason as "no objections"). Whitespace-only reasons
  // are rejected — they would pass the !input.reason check but produce
  // useless cohort data.
  if (toStatus === "Lost") {
    const trimmed = (input.reason ?? "").trim();
    if (trimmed === "") {
      throw new TransitionError("A reason is required when marking a quote Lost.", 400);
    }
  }
}

export async function recordTransition(
  tx: DbClient,
  args: {
    orgId: string;
    quoteId: string;
    quoteNumber: string;
    fromStatus: CrmQuoteStatus;
    toStatus: CrmQuoteStatus;
    changedByUserId: string | null;
    changedByName: string | null;
    reason: string | null;
    notes: string | null;
  },
): Promise<void> {
  await tx.crmQuoteStatusTransition.create({
    data: {
      orgId: args.orgId,
      quoteId: args.quoteId,
      fromStatus: args.fromStatus,
      toStatus: args.toStatus,
      changedByUserId: args.changedByUserId,
      changedByName: args.changedByName,
      reason: args.reason,
      notes: args.notes,
    },
  });
  await tx.crmActivity.create({
    data: {
      orgId: args.orgId,
      type: "QuoteStatusChange",
      relatedKind: "Quote",
      relatedObjectId: args.quoteId,
      subject: `${args.quoteNumber}: ${args.fromStatus} → ${args.toStatus}`,
      outcome: args.reason ?? "",
      ownerId: args.changedByUserId,
      ownerName: args.changedByName,
      occurredAt: new Date(),
    },
  });
}

/**
 * Apply a status transition end-to-end: validate, mutate the quote, write
 * the audit rows, **and sync side-effects on the linked Opportunity**.
 *
 * State-sync contract (matches Salesforce CPQ / D365 Sales behaviour, and
 * fixes audit finding W-1 in crm-workflow-architecture-audit.md):
 *
 *   Quote: Active → Won
 *     ⤷ Opportunity.probability = 100
 *     ⤷ Opportunity.lastActivityAt = now
 *     ⤷ CrmActivity{type:OpportunityProbabilityFromQuote} on the opportunity
 *
 *   Quote: Active → Lost
 *     ⤷ Opportunity.probability = 0
 *     ⤷ Opportunity.lastActivityAt = now
 *     ⤷ CrmActivity{type:OpportunityProbabilityFromQuote} on the opportunity
 *
 * Why inline (vs an event bus): we don't have a domain-event primitive yet
 * (P-1 in the audit). Inline sync inside the same transaction is the
 * pragmatic "do it now" — when the event bus lands, lift this into a
 * `QuoteWon`/`QuoteLost` consumer. Keep this comment as the migration
 * marker so the lift-out is obvious.
 */
export async function transitionQuote(args: {
  orgId: string;
  userId: string;
  userName: string | null;
  quoteId: string;
  input: TransitionInput;
}) {
  return serverlessTransaction(db, async (tx) => {
    const existing = await tx.crmQuote.findFirst({
      where: { id: args.quoteId, orgId: args.orgId },
      // opportunityId pulled into the row so the side-effect block doesn't
      // need a second read.
      select: { id: true, quoteNumber: true, status: true, opportunityId: true },
    });
    if (!existing) throw new TransitionError("Quote not found.", 404);

    validateTransition(existing.status, args.input);

    const data: Prisma.CrmQuoteUncheckedUpdateInput = { status: args.input.toStatus };
    const now = new Date();
    if (args.input.toStatus === "Active") data.sentAt = now;
    if (args.input.toStatus === "Won") data.wonAt = now;
    if (args.input.toStatus === "Lost") {
      data.lostAt = now;
      data.lostReason = args.input.reason ?? null;
      data.lostNotes = args.input.notes ?? null;
    }

    await tx.crmQuote.update({ where: { id: args.quoteId }, data });
    await recordTransition(tx, {
      orgId: args.orgId,
      quoteId: args.quoteId,
      quoteNumber: existing.quoteNumber,
      fromStatus: existing.status,
      toStatus: args.input.toStatus,
      changedByUserId: args.userId,
      changedByName: args.userName,
      reason: args.input.reason ?? null,
      notes: args.input.notes ?? null,
    });

    // ─── Opportunity probability sync (audit finding W-1) ─────────────
    // Only when the quote is linked to an opportunity AND the transition
    // is to a terminal won/lost. `updateMany` (not `update`) so the
    // orgId condition is enforced at the SQL level — defense in depth
    // even though the quote's tenant has already been verified above.
    if (existing.opportunityId && (args.input.toStatus === "Won" || args.input.toStatus === "Lost")) {
      const nextProbability = args.input.toStatus === "Won" ? 100 : 0;
      const updated = await tx.crmOpportunity.updateMany({
        where: {
          id: existing.opportunityId,
          orgId: args.orgId,
          // Don't overwrite a manual probability on an already-closed opp.
          // If the opp is still open, sync. If sales ops has already
          // ClosedWon/ClosedLost it themselves, leave their decision alone.
          stage: { in: ["Prospecting", "Qualification", "Proposal", "Negotiation"] },
        },
        data: {
          probability: nextProbability,
          lastActivityAt: now,
        },
      });
      // Activity row on the opportunity timeline so reps see *why* the
      // probability moved. Skipped when the opp was already closed (no
      // mutation happened above).
      if (updated.count > 0) {
        await tx.crmActivity.create({
          data: {
            orgId: args.orgId,
            type: "OpportunityProbabilityFromQuote",
            relatedKind: "Opportunity",
            relatedObjectId: existing.opportunityId,
            subject: `Probability ${nextProbability}% from quote ${existing.quoteNumber} (${args.input.toStatus})`,
            outcome: args.input.reason ?? "",
            ownerId: args.userId,
            ownerName: args.userName,
            occurredAt: now,
          },
        });
      }
    }
    // ──────────────────────────────────────────────────────────────────

    return tx.crmQuote.findFirst({
      where: { id: args.quoteId, orgId: args.orgId },
      include: {
        lines: { orderBy: [{ sortOrder: "asc" }, { lineNumber: "asc" }] },
      },
    });
  });
}
