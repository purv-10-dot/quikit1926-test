/**
 * Shared approval-timeline DTO builder.
 *
 * Every entity detail route (`/api/<entity>/[id]`) that carries an
 * `approvalId` renders the same Approval Timeline. They all fetch the
 * instance with the identical include below and reshape it into the
 * same DTO so the shared `ApprovalTimeline` component renders without
 * adapter code. This module owns that include + reshape so the routes
 * stay type-safe and DRY.
 */

import type { Prisma } from "@prisma/client";
import {
  classifyRepair,
  parseStepsSnapshot,
} from "@/lib/approvals/step-resolution";

/** The include every detail route uses when loading its approval instance. */
export const APPROVAL_INSTANCE_INCLUDE = {
  history: { orderBy: { actionAt: "asc" } },
  workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
} as const satisfies Prisma.CnApprovalInstanceInclude;

/** The fully-included approval instance the DTO builder consumes. */
export type ApprovalInstanceFull = Prisma.CnApprovalInstanceGetPayload<{
  include: typeof APPROVAL_INSTANCE_INCLUDE;
}>;

/** The client-facing approval-timeline shape returned by detail routes. */
export type ApprovalDto = ReturnType<typeof buildApprovalDto>;

/**
 * Every user id whose name the timeline needs: the requester, everyone who
 * acted, and every approver on the instance's chain.
 *
 * Covers both the live workflow steps and the submit-time snapshot. Those
 * diverge as soon as the workflow is edited, and the snapshot is what gets
 * rendered — resolving only the live steps left the original approver showing
 * as a bare role with no name. Also covers `approverUserIds` pools, not just
 * the legacy single `approverUserId`.
 */
export function collectApprovalUserIds(
  instance: ApprovalInstanceFull,
): string[] {
  const ids = new Set<string>();
  ids.add(instance.requestedById);
  for (const h of instance.history) ids.add(h.actionById);

  const addStep = (s: {
    approverUserId?: string | null;
    approverUserIds?: string[] | null;
  }) => {
    if (s.approverUserId) ids.add(s.approverUserId);
    for (const id of s.approverUserIds ?? []) if (id) ids.add(id);
  };
  for (const s of instance.workflow.steps) addStep(s);
  for (const s of parseStepsSnapshot(instance.stepsSnapshot) ?? []) addStep(s);

  return [...ids].filter(Boolean);
}

export function buildApprovalDto(
  instance: ApprovalInstanceFull,
  nameById: Map<string, string>,
  /**
   * Whether the caller may act on the current step. Some detail routes
   * surface this (so the UI can show approve/reject buttons); others
   * don't compute it. When omitted the key is `undefined` and is
   * dropped from the JSON response, preserving those routes' shape.
   */
  canActOnCurrentStep?: boolean,
) {
  // The instance's own chain — its submit-time snapshot when it has one, else
  // the live workflow rows. Rendering the live rows for a snapshotted instance
  // would show whoever the workflow names today rather than who this request
  // was actually routed to.
  const steps =
    parseStepsSnapshot(instance.stepsSnapshot) ?? instance.workflow.steps;

  // Derived from the chain + history already loaded — no extra query. Non-null
  // only while pending: a settled instance has nothing to repair.
  const repair =
    instance.status === "pending_approval"
      ? classifyRepair(steps, instance.history, instance.currentStepOrder)
      : null;

  return {
    id: instance.id,
    status: instance.status,
    currentStepOrder: instance.currentStepOrder,
    canActOnCurrentStep,
    repair,
    completedAt: instance.completedAt?.toISOString?.() ?? null,
    requestedAt: instance.requestedAt.toISOString(),
    requestedById: instance.requestedById,
    requestedByName: nameById.get(instance.requestedById) ?? "User",
    workflow: {
      id: instance.workflow.id,
      name: instance.workflow.name,
      steps: steps.map((s) => {
        const pool = (s.approverUserIds ?? []).filter(Boolean);
        // Name the step's approver from the legacy single id, else the first of
        // the pool — a pool-only step used to render as a bare role label.
        const namedId = s.approverUserId ?? pool[0] ?? null;
        return {
          stepOrder: s.stepOrder,
          approverRoleId: s.approverRoleId,
          approverUserId: s.approverUserId,
          approverUserIds: pool,
          approverUserName: namedId ? (nameById.get(namedId) ?? null) : null,
          /** Every eligible approver's name, for pool steps. */
          approverUserNames: pool
            .map((id) => nameById.get(id) ?? null)
            .filter((n): n is string => Boolean(n)),
        };
      }),
    },
    history: instance.history.map((h) => ({
      stepOrder: h.stepOrder,
      action: h.action,
      actionById: h.actionById,
      actionByName: nameById.get(h.actionById) ?? "User",
      actionAt: h.actionAt.toISOString(),
      comments: h.comments,
    })),
  };
}
