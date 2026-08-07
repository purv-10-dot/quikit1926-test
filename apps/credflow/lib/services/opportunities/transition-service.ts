/**
 * Stage transition rules and audit-row writer.
 *
 * Governs the legal moves between QcfOpportunityStage values, enforces that
 * close-deal transitions carry a closeReasonCategory, prevents departures
 * from terminal stages without an admin override, and writes both a
 * QcfOpportunityStageTransition row and a QcfActivity row on every accepted
 * transition.
 */
import type { QcfOpportunityStage, Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { CLOSE_REASON_CATEGORIES, STAGE_LABEL } from "./stage-labels";

// Default config: any → any. Governance lives entirely in the audit log
// (QcfOpportunityStageTransition + QcfActivity). The only remaining hard
// guards are:
//   - Self-transitions (no-op writes pollute the audit log)
//   - Closing requires a closeReasonCategory (forecast cohort analysis)
//
// The matrix is kept as data so a workspace can re-tighten the rules later
// (e.g. via QcfOrgWorkspaceSettings.settings.opportunityTransitions). For
// now every stage allows every other stage.
const ALL_STAGES: QcfOpportunityStage[] = [
  "Prospecting",
  "Qualification",
  "Proposal",
  "Negotiation",
  "ClosedWon",
  "ClosedLost",
];

function allOther(self: QcfOpportunityStage): QcfOpportunityStage[] {
  return ALL_STAGES.filter((s) => s !== self);
}

export const TRANSITIONS: Record<QcfOpportunityStage, QcfOpportunityStage[]> = {
  Prospecting: allOther("Prospecting"),
  Qualification: allOther("Qualification"),
  Proposal: allOther("Proposal"),
  Negotiation: allOther("Negotiation"),
  ClosedWon: allOther("ClosedWon"),
  ClosedLost: allOther("ClosedLost"),
};

export type TransitionInput = {
  toStage: QcfOpportunityStage;
  closeReason?: string | null;
  closeReasonCategory?: string | null;
  notes?: string | null;
  force?: boolean;
};

export class TransitionError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Validate a proposed move. Throws TransitionError on rejection.
 *
 * @param fromStage current stage
 * @param input desired move + close metadata
 * @param isAdmin whether the caller has admin override (Administrator role)
 */
export function validateTransition(
  fromStage: QcfOpportunityStage,
  input: TransitionInput,
  isAdmin: boolean,
): void {
  const { toStage, closeReasonCategory, force } = input;

  if (fromStage === toStage) {
    throw new TransitionError(`Already in ${STAGE_LABEL[toStage]}`);
  }

  // Single rule: must be in the per-stage allowed list unless an admin
  // forces it via ?force=true (kept as an escape hatch for the rare
  // open-stage skip — e.g. Qualification → Negotiation without going
  // through Proposal). Closed→anywhere is now in the matrix, so terminal
  // departures don't need the override anymore.
  const allowed = TRANSITIONS[fromStage];
  if (!allowed.includes(toStage) && !(isAdmin && force)) {
    throw new TransitionError(
      `Cannot move from ${STAGE_LABEL[fromStage]} to ${STAGE_LABEL[toStage]} directly.`,
    );
  }

  // Closing a deal requires a category for forecast cohort analysis.
  if (toStage === "ClosedWon" || toStage === "ClosedLost") {
    if (!closeReasonCategory || closeReasonCategory.trim() === "") {
      throw new TransitionError(
        `closeReasonCategory is required when moving to ${STAGE_LABEL[toStage]}.`,
      );
    }
    const choices = CLOSE_REASON_CATEGORIES[toStage] as readonly string[];
    if (!choices.includes(closeReasonCategory)) {
      throw new TransitionError(
        `closeReasonCategory must be one of: ${choices.join(", ")}.`,
      );
    }
  }
}

/**
 * Write the audit row + QcfActivity entry. Caller is responsible for actually
 * mutating the QcfOpportunity (so the transition write happens in the same
 * Prisma transaction as the field updates).
 */
export async function recordTransition(
  tx: Prisma.TransactionClient | typeof db,
  args: {
    tenantId: string;
    opportunityId: string;
    opportunityName: string;
    fromStage: QcfOpportunityStage;
    toStage: QcfOpportunityStage;
    changedByUserId: string | null;
    changedByName: string | null;
    closeReason: string | null;
    closeReasonCategory: string | null;
    notes: string | null;
  },
): Promise<void> {
  await tx.qcfOpportunityStageTransition.create({
    data: {
      tenantId: args.tenantId,
      opportunityId: args.opportunityId,
      fromStage: args.fromStage,
      toStage: args.toStage,
      changedByUserId: args.changedByUserId,
      changedByName: args.changedByName,
      closeReason: args.closeReason,
      closeReasonCategory: args.closeReasonCategory,
      notes: args.notes,
    },
  });

  await tx.qcfActivity.create({
    data: {
      tenantId: args.tenantId,
      type: "OpportunityStageChange",
      relatedKind: "Opportunity",
      relatedObjectId: args.opportunityId,
      subject: `${args.opportunityName}: ${STAGE_LABEL[args.fromStage]} → ${STAGE_LABEL[args.toStage]}`,
      outcome: args.closeReason ?? args.closeReasonCategory ?? "",
      ownerId: args.changedByUserId,
      ownerName: args.changedByName,
      occurredAt: new Date(),
    },
  });

  // ─── Cascade to dependent Quotes (audit finding W-5) ─────────────────
  // When an opportunity closes Lost (or Won), any of its still-Active
  // quotes should be auto-resolved so they don't sit forever in "Active"
  // hiding stale pricing. Mirrors Salesforce CPQ: closing the parent
  // opportunity propagates a terminal status downstream.
  //
  // Rules:
  //   - Opp → ClosedLost: every Active quote of this opp becomes Lost
  //     with lostReason="Opportunity closed lost" so analytics can
  //     distinguish auto-cascade from rep-driven loss.
  //   - Opp → ClosedWon: Active quotes left alone (the rep usually wants
  //     to mark one of them Won via the Quote Builder, not blanket-Lose).
  //   - Quote-Won quotes are never touched (terminal).
  //
  // Done as `updateMany` (not per-row) so the SQL is one statement, and
  // a `findMany` afterwards to emit per-quote activity rows for the
  // audit timeline. No transition rows are written for the cascade —
  // that would conflate user action with system cascade; the activity
  // type `QuoteAutoLostFromOpportunity` makes the source unambiguous.
  if (args.toStage === "ClosedLost") {
    const now = new Date();
    const activeQuotes = await tx.qcfQuote.findMany({
      where: {
        tenantId: args.tenantId,
        opportunityId: args.opportunityId,
        status: "Active",
      },
      select: { id: true, quoteNumber: true },
    });
    if (activeQuotes.length > 0) {
      await tx.qcfQuote.updateMany({
        where: {
          tenantId: args.tenantId,
          opportunityId: args.opportunityId,
          status: "Active",
        },
        data: {
          status: "Lost",
          lostAt: now,
          lostReason: "Opportunity closed lost",
          lostNotes: args.notes ?? args.closeReason ?? null,
        },
      });
      // One activity row per cascaded quote — keeps the timeline truthful
      // (each affected quote shows up under its own record's timeline).
      for (const q of activeQuotes) {
        await tx.qcfActivity.create({
          data: {
            tenantId: args.tenantId,
            type: "QuoteAutoLostFromOpportunity",
            relatedKind: "Quote",
            relatedObjectId: q.id,
            subject: `${q.quoteNumber} auto-lost: parent opportunity closed lost`,
            outcome: args.closeReason ?? args.closeReasonCategory ?? "",
            ownerId: args.changedByUserId,
            ownerName: args.changedByName,
            occurredAt: now,
          },
        });
      }
    }
  }
  // ──────────────────────────────────────────────────────────────────────
}
