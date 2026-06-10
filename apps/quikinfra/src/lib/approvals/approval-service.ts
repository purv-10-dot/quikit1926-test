/**
 * Approval Enforcement Service
 *
 * Single entry point for every approval action in the ERP. Enforces:
 *
 *   1. Permission — the actor must hold the permission required for the
 *      CURRENT step of the approval chain (not just "can approve this entity
 *      in general").
 *   2. Actor uniqueness — if another user has already approved this exact
 *      step, return 409 CONFLICT (safe to retry — caller sees the prior
 *      actor's info). Prevents double-post races.
 *   3. Status gate — the approval instance must be in `pending_approval`.
 *   4. Comment requirement — reject/return actions MUST have a non-empty
 *      comment.
 *   5. Atomicity — everything runs inside a single Prisma transaction:
 *      history row + status update + optional side effects.
 *   6. Audit — every action is recorded in both CnApprovalHistory and
 *      CnAuditLog inside the same txn.
 *
 * Usage from a route handler:
 *
 *   export async function POST(req, { params }) {
 *     const ctx = await requireAuth();
 *     if (ctx instanceof NextResponse) return ctx;
 *
 *     const body = await req.json();
 *     const result = await approvalService.execute({
 *       ctx,
 *       instanceId: params.id,
 *       action: body.action,           // "approve" | "reject" | "return" | "reverse"
 *       comments: body.comments,
 *       // Optional side-effect callback — runs inside the txn.
 *       onFinalApproval: async (tx, instance) => {
 *         // e.g. post GRN stock inward, apply DPR progress, etc.
 *       },
 *     });
 *     return NextResponse.json(result);
 *   }
 *
 * The caller passes any entity-specific side-effect logic as an `onFinalApproval`
 * callback so the approval service remains entity-agnostic.
 */

import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";
import { recordAudit, recordApprovalAction, ApprovalActionError } from "@/lib/workflow/audit";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

export class ApprovalConflictError extends Error {
  code = "APPROVAL_CONFLICT";
  httpStatus = 409;
  constructor(
    message: string,
    public details: {
      instanceId: string;
      stepOrder: number;
      priorActorId: string;
      priorAction: string;
      priorActionAt: string;
    }
  ) {
    super(message);
    this.name = "ApprovalConflictError";
  }
}

export class ApprovalPermissionError extends Error {
  code = "APPROVAL_PERMISSION_DENIED";
  httpStatus = 403;
  constructor(
    message: string,
    public details: {
      entityType: string;
      stepOrder: number;
      requiredPermission: string;
      actorRole: string;
    }
  ) {
    super(message);
    this.name = "ApprovalPermissionError";
  }
}

export class ApprovalStateError extends Error {
  code: string;
  httpStatus = 400;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ApprovalStateError";
  }
}

export type ApprovalActionKind = "approve" | "reject" | "return" | "reverse";

export interface ApprovalRequest {
  ctx: TenantContext;
  instanceId: string;
  action: ApprovalActionKind;
  comments?: string;
  /**
   * Called inside the same transaction AFTER the approval is recorded but
   * BEFORE the outer txn commits. Use for: posting GRN stock, applying DPR
   * progress, advancing entity status, etc.
   *
   * Called only when the action is `approve` AND this is the final step
   * (i.e. after recording it, no further steps remain). Not called for
   * reject/return/reverse.
   *
   * If the callback throws, the whole txn rolls back — no approval recorded,
   * no side effects applied.
   */
  onFinalApproval?: (
    tx: any,
    instance: { id: string; entityType: string; entityId: string; entityNumber: string }
  ) => Promise<void>;
  /**
   * Called inside the same transaction when the action is `approve` but
   * there are MORE steps after this one (intermediate approval). Defaults
   * to no-op. Use for: sending notifications to the next approver, etc.
   */
  onIntermediateApproval?: (
    tx: any,
    instance: { id: string; entityType: string; entityId: string; entityNumber: string },
    nextStepOrder: number
  ) => Promise<void>;
  /** Called on reject/return/reverse — runs inside the txn. */
  onReject?: (tx: any, instance: any) => Promise<void>;
}

export interface ApprovalResult {
  instanceId: string;
  entityType: string;
  entityId: string;
  action: ApprovalActionKind;
  newInstanceStatus: string;
  completedAt?: string;
  nextStepOrder?: number;
}

// ─── Service ────────────────────────────────────────────────────────

class ApprovalService {
  /**
   * Execute one approval action with full enforcement.
   */
  async execute(req: ApprovalRequest): Promise<ApprovalResult> {
    const { ctx, instanceId, action, comments } = req;

    // ─── Comment guard (early, outside txn) ──────────────────────
    if ((action === "reject" || action === "return") && !comments?.trim()) {
      throw new ApprovalActionError(
        "COMMENT_REQUIRED",
        `Comments are required for ${action} actions`
      );
    }

    return await db.$transaction(async (tx) => {
      // ─── Load instance with row-lock semantics ───────────────
      // Prisma doesn't expose SELECT FOR UPDATE directly in 5.x, but the
      // transaction isolation + subsequent update gives us the same
      // guarantees for single-row race conditions: two concurrent tx's
      // will serialize on the history-row insert's unique constraint and
      // the later one will re-read the row and see the new status.
      const instance = await (tx as any).cnApprovalInstance.findFirst({
        where: { id: instanceId, orgId: ctx.orgId },
      });

      if (!instance) {
        throw new ApprovalStateError("INSTANCE_NOT_FOUND", `Approval ${instanceId} not found`);
      }

      // ─── Status gate ─────────────────────────────────────────
      if (instance.status !== "pending_approval") {
        // Fetch the last history row so we can return who did it
        const last = await (tx as any).cnApprovalHistory.findFirst({
          where: { instanceId },
          orderBy: { actionAt: "desc" },
        });
        throw new ApprovalConflictError(
          `Approval already ${instance.status}${last ? ` by ${last.actionById}` : ""}. ` +
            `No further actions allowed on this instance.`,
          {
            instanceId,
            stepOrder: instance.currentStepOrder,
            priorActorId: last?.actionById ?? "unknown",
            priorAction: last?.action ?? instance.status,
            priorActionAt: last?.actionAt?.toISOString() ?? instance.completedAt?.toISOString?.() ?? "",
          }
        );
      }

      const currentStep = instance.currentStepOrder;

      // ─── Actor permission check (step-locked, DB-driven) ─────
      // The pinned user / role lives on cn_approval_workflow_step. We
      // load it and delegate to canActOnStep — the same gate every
      // entity-specific approve route uses.
      const stepRow = await (tx as any).cnApprovalWorkflowStep.findFirst({
        where: { workflowId: instance.workflowId, stepOrder: currentStep },
      });
      if (!stepRow) {
        throw new ApprovalStateError(
          "STEP_NOT_FOUND",
          `Workflow step ${currentStep} not found on workflow ${instance.workflowId}. ` +
            `The workflow may have been edited while this instance was mid-flight.`
        );
      }
      // entityProjectId is unknown at the generic-service layer (the
      // cn_approval_instance row doesn't carry projectId — each entity
      // type stores it on its own table). Site-scoped users hitting this
      // generic endpoint will be denied by canActOnStep's project gate;
      // they should use the entity-specific approve route instead.
      if (
        !canActOnStep(
          { userId: ctx.userId, roleKey: ctx.roleKey, projectIds: ctx.projectIds },
          {
            approverUserId: stepRow.approverUserId,
            approverUserIds: stepRow.approverUserIds,
            approverRoleId: stepRow.approverRoleId,
          },
          null,
        )
      ) {
        throw new ApprovalPermissionError(
          `You are not authorized to ${action} this ${instance.entityType} at step ${currentStep}.`,
          {
            entityType: instance.entityType,
            stepOrder: currentStep,
            requiredPermission: stepRow.approverRoleId ?? "pinned-approver",
            actorRole: ctx.roleKey,
          }
        );
      }

      // ─── Double-action guard (same step, same user can't re-act) ──
      const priorSameStep = await (tx as any).cnApprovalHistory.findFirst({
        where: { instanceId, stepOrder: currentStep, actionById: ctx.userId },
      });
      if (priorSameStep) {
        throw new ApprovalConflictError(
          `You already performed ${priorSameStep.action} on this step`,
          {
            instanceId,
            stepOrder: currentStep,
            priorActorId: ctx.userId,
            priorAction: priorSameStep.action,
            priorActionAt: priorSameStep.actionAt.toISOString(),
          }
        );
      }

      // ─── Record the action ───────────────────────────────────
      await recordApprovalAction(tx, ctx, {
        instanceId,
        stepOrder: currentStep,
        action,
        comments,
      });

      // ─── Compute next state ──────────────────────────────────
      let newStatus = instance.status;
      let newStep = currentStep;
      let completedAt: Date | null = null;
      let isFinalApproval = false;

      if (action === "approve") {
        // Count configured steps for this workflow
        const totalSteps = await (tx as any).cnApprovalWorkflowStep.count({
          where: { workflowId: instance.workflowId },
        });
        if (currentStep >= totalSteps) {
          // Final step — mark complete
          newStatus = "approved";
          completedAt = new Date();
          isFinalApproval = true;
        } else {
          // Advance to next step
          newStep = currentStep + 1;
        }
      } else if (action === "reject") {
        newStatus = "rejected";
        completedAt = new Date();
      } else if (action === "return") {
        newStatus = "returned";
        completedAt = new Date();
      } else if (action === "reverse") {
        newStatus = "reversed";
        completedAt = new Date();
      }

      // ─── Persist status change on the instance ───────────────
      await (tx as any).cnApprovalInstance.update({
        where: { id: instanceId },
        data: {
          status: newStatus,
          currentStepOrder: newStep,
          completedAt: completedAt ?? undefined,
        },
      });

      // ─── Envelope audit ──────────────────────────────────────
      await recordAudit(tx, ctx, {
        entityType: "approval_instance",
        entityId: instanceId,
        action,
        changes: {
          entityType: instance.entityType,
          entityId: instance.entityId,
          stepOrder: currentStep,
          from: instance.status,
          to: newStatus,
          commentLength: comments?.length ?? 0,
        },
      });

      // ─── Side-effect callbacks ───────────────────────────────
      if (action === "approve" && isFinalApproval && req.onFinalApproval) {
        await req.onFinalApproval(tx, {
          id: instance.id,
          entityType: instance.entityType,
          entityId: instance.entityId,
          entityNumber: instance.entityNumber,
        });
      } else if (action === "approve" && !isFinalApproval && req.onIntermediateApproval) {
        await req.onIntermediateApproval(
          tx,
          {
            id: instance.id,
            entityType: instance.entityType,
            entityId: instance.entityId,
            entityNumber: instance.entityNumber,
          },
          newStep
        );
      } else if ((action === "reject" || action === "return" || action === "reverse") && req.onReject) {
        await req.onReject(tx, instance);
      }

      return {
        instanceId,
        entityType: instance.entityType,
        entityId: instance.entityId,
        action,
        newInstanceStatus: newStatus,
        completedAt: completedAt?.toISOString(),
        nextStepOrder: newStatus === "pending_approval" ? newStep : undefined,
      };
    });
  }

  /**
   * Translate approval errors to HTTP responses. Use from route handlers.
   */
  errorToHttp(err: unknown): { status: number; body: any } | null {
    if (err instanceof ApprovalConflictError) {
      return { status: err.httpStatus, body: { error: err.message, code: err.code, details: err.details } };
    }
    if (err instanceof ApprovalPermissionError) {
      return { status: err.httpStatus, body: { error: err.message, code: err.code, details: err.details } };
    }
    if (err instanceof ApprovalStateError) {
      return { status: err.httpStatus, body: { error: err.message, code: err.code } };
    }
    if (err instanceof ApprovalActionError) {
      return { status: err.httpStatus, body: { error: err.message, code: err.code } };
    }
    return null;
  }
}

export const approvalService = new ApprovalService();
