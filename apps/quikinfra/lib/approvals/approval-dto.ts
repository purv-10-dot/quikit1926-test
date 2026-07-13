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
  return {
    id: instance.id,
    status: instance.status,
    currentStepOrder: instance.currentStepOrder,
    canActOnCurrentStep,
    completedAt: instance.completedAt?.toISOString?.() ?? null,
    requestedAt: instance.requestedAt.toISOString(),
    requestedById: instance.requestedById,
    requestedByName: nameById.get(instance.requestedById) ?? "User",
    workflow: {
      id: instance.workflow.id,
      name: instance.workflow.name,
      steps: instance.workflow.steps.map((s) => ({
        stepOrder: s.stepOrder,
        approverRoleId: s.approverRoleId,
        approverUserId: s.approverUserId,
        approverUserName: s.approverUserId
          ? (nameById.get(s.approverUserId) ?? null)
          : null,
      })),
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
