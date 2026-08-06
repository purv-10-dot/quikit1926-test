/**
 * Atomic claim on an approval instance.
 *
 * Every approve path used to read `status === "pending_approval"` well before
 * opening its transaction — the PR route checks at line ~94 and commits at
 * ~220, with stock lookups in between; the DPR route has BOQ pre-resolution in
 * the same gap. Two people acting in that window both passed the read and both
 * committed, which is not merely an untidy audit trail: the DPR posted its BOQ
 * progress and material consumption twice, and the PR created two Material
 * Issues. Master Approval makes this far more likely, because now there is
 * always a second person entitled to act on every step.
 *
 * `claimInstanceForSettlement` replaces the read with a conditional UPDATE
 * inside the transaction. The `where` clause carries `status:
 * "pending_approval"`, so exactly one caller can match the row; everyone else
 * matches zero and is told who beat them — before any side effect runs.
 */

import type { Prisma } from "@quikit/database";
import { MASTER_APPROVAL_MARKER } from "@/lib/approvals/history-markers";

export interface ClaimResult {
  claimed: boolean;
  /** Populated when the claim failed — who settled it, and how. */
  conflict?: {
    status: string;
    byUserId: string | null;
    /** True when the winning action was a master approval. */
    viaMasterApproval: boolean;
    stepOrder: number | null;
  };
}

/**
 * Try to move a pending instance to its settled state. Returns
 * `{ claimed: false, conflict }` when someone else already settled it.
 *
 * Must be called inside the same transaction as the history row and the
 * entity's own status patch, so a losing caller writes nothing at all.
 */
export async function claimInstanceForSettlement(
  tx: Prisma.TransactionClient,
  instanceId: string,
  data: {
    status: "approved" | "rejected" | "returned";
    completedAt: Date;
    currentStepOrder: number;
  },
): Promise<ClaimResult> {
  const claimed = await tx.cnApprovalInstance.updateMany({
    where: { id: instanceId, status: "pending_approval" },
    data,
  });
  // Fail closed: an unexpected result means we cannot prove we own the row.
  if ((claimed?.count ?? 0) > 0) return { claimed: true };

  return { claimed: false, conflict: await describeConflict(tx, instanceId) };
}

/**
 * Advance a pending instance to its next step. Same guard: an instance someone
 * else already settled must not be dragged back into `pending_approval`.
 */
export async function claimInstanceForAdvance(
  tx: Prisma.TransactionClient,
  instanceId: string,
  nextStepOrder: number,
): Promise<ClaimResult> {
  const claimed = await tx.cnApprovalInstance.updateMany({
    where: { id: instanceId, status: "pending_approval" },
    data: { currentStepOrder: nextStepOrder },
  });
  // Fail closed: an unexpected result means we cannot prove we own the row.
  if ((claimed?.count ?? 0) > 0) return { claimed: true };

  return { claimed: false, conflict: await describeConflict(tx, instanceId) };
}

/**
 * Build the same conflict description for an instance that was already settled
 * before the request even reached its transaction — the common case, where the
 * page sat open while someone else acted. Without this the caller falls back to
 * a bare "already approved", which doesn't tell the step's own approver that the
 * master approver closed it.
 */
export async function describeSettledInstance(
  client: Pick<Prisma.TransactionClient, "cnApprovalInstance" | "cnApprovalHistory">,
  instanceId: string,
): Promise<NonNullable<ClaimResult["conflict"]>> {
  return (await describeConflict(client, instanceId))!;
}

async function describeConflict(
  tx: Pick<Prisma.TransactionClient, "cnApprovalInstance" | "cnApprovalHistory">,
  instanceId: string,
): Promise<ClaimResult["conflict"]> {
  const [instance, last] = await Promise.all([
    tx.cnApprovalInstance.findUnique({
      where: { id: instanceId },
      select: { status: true },
    }),
    tx.cnApprovalHistory.findFirst({
      where: { instanceId },
      orderBy: { actionAt: "desc" },
      select: { actionById: true, stepOrder: true, comments: true },
    }),
  ]);

  return {
    status: instance?.status ?? "settled",
    byUserId: last?.actionById ?? null,
    viaMasterApproval: Boolean(
      last?.comments?.startsWith(MASTER_APPROVAL_MARKER),
    ),
    stepOrder: last?.stepOrder ?? null,
  };
}

/**
 * The message the losing caller sees. Names the master approver explicitly when
 * they won, so the step's own approver understands the request was closed by
 * the workflow's fallback rather than hitting a generic race error.
 */
export function conflictMessage(
  conflict: NonNullable<ClaimResult["conflict"]>,
  actorName: string | null,
  entityLabel: string,
): string {
  const who = actorName ?? "another user";
  if (conflict.viaMasterApproval) {
    return (
      `This ${entityLabel} has already been approved by ${who} as the workflow's ` +
      `master approver, so no further approval is needed.`
    );
  }
  const at =
    conflict.stepOrder !== null ? ` at step ${conflict.stepOrder}` : "";
  return `This ${entityLabel} was already ${conflict.status} by ${who}${at}.`;
}