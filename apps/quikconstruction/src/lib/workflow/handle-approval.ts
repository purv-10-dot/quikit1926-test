/**
 * Shared approval-action handler — Prisma/Postgres-backed.
 *
 * Used by simple approval flows that flip a single entity's status
 * (PO / RFQ / Material Issue / Stock Reconciliation). Multi-step
 * workflow approvals (PR, Indent) use `approvalService.execute` from
 * `src/lib/approvals/approval-service.ts` instead — that path knows how
 * to navigate `CnApprovalInstance` + `CnApprovalWorkflowStep`.
 *
 * Usage in a route handler:
 *
 *   export async function POST(req, { params }) {
 *     return handleApprovalAction(req, {
 *       prismaModel: "cnPurchaseOrder",
 *       entityId: params.id,
 *       entityType: "po",
 *       requiredPermission: "purchase.po.approve_l1",
 *       transitions: {
 *         approve: ["pending_approval", "submitted"],
 *         reject:  ["pending_approval", "submitted"],
 *         return:  ["pending_approval", "submitted"],
 *       },
 *     });
 *   }
 *
 * What it does:
 *   1. requireAuth + requirePermission gate
 *   2. rate limit via LIMITS.APPROVAL (30/min/user)
 *   3. parse {action, comments} body
 *   4. find entity in Postgres (tenant-scoped)
 *   5. assert action is allowed given current status
 *   6. require comments on reject/return
 *   7. inside one transaction: run optional onApproved side effect,
 *      flip status (+ approvedBy/At, rejectedBy/At, returnedBy/At,
 *      rejectionReason, returnReason — only fields that exist on the
 *      target model), and write a CnAuditLog row
 *   8. emit structured log
 *   9. return {ok, data:{id, status, action, entity}} envelope
 *
 * The helper DOES NOT touch ledgers — that's the caller's job via
 * the `onApproved` callback (e.g. Material Issue posts stock outward,
 * GRN posts inward). Cleanly separated so each entity can customize
 * side effects, and the side effect runs in the same DB transaction
 * as the status flip.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission, type TenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db/prisma";
import { recordAudit } from "@/lib/workflow/audit";
import { rateLimit, LIMITS } from "./rate-limit";
import { logger } from "@/lib/observability/logger";
import { ok, err } from "@/lib/http/envelope";
import { Prisma } from "../../../node_modules/.prisma-qc/client";

export type ApprovalAction = "approve" | "reject" | "return";

export interface TransitionsMap {
  approve?: string[];
  reject?: string[];
  return?: string[];
}

export interface HandleApprovalOptions {
  /** Prisma client model name on `db`, e.g. "cnPurchaseOrder", "cnRfq",
   *  "cnMaterialIssue", "cnStockReconciliation". */
  prismaModel: string;
  /** Entity id from the route params. */
  entityId: string;
  /** Short entity type label for audit + logs (e.g. "po", "rfq"). */
  entityType: string;
  /** Permission required to perform ANY action. */
  requiredPermission: string;
  /** Which current statuses permit each action. */
  transitions: TransitionsMap;
  /**
   * Prisma `include` for the find query. Use to load relations the
   * `onApproved` callback needs (e.g. `{ lines: true }`).
   */
  include?: Record<string, unknown>;
  /**
   * Side effect on "approve" — runs inside the same DB transaction
   * as the status flip, so a thrown error rolls everything back.
   * Throw a `{ code, httpStatus, message }` object to control the
   * client-facing error.
   */
  onApproved?: (entity: any, tx: any, ctx: TenantContext) => Promise<void>;
  /** Status to set when action is "approve". Default: "approved". */
  nextStatusOnApprove?: (currentStatus: string) => string;
  /** Status on reject. Default: "rejected". */
  rejectStatus?: string;
  /** Status on return. Default: "returned". */
  returnStatus?: string;
}

// ─── Per-model field discovery ─────────────────────────────────────────
// Each entity has a different set of approval/rejection audit fields.
// Material Issue has the full set (approvedAt/By, rejectedAt/By/Reason,
// returnedAt/By/Reason). Stock Reconciliation has only `approvedById`.
// PO and RFQ have none — only `status` + `updatedBy`. We introspect the
// generated Prisma client at module load and only emit fields that
// actually exist on the target model.

const FIELDS_BY_MODEL: Record<string, Set<string>> = (() => {
  const map: Record<string, Set<string>> = {};
  try {
    for (const model of Prisma.dmmf.datamodel.models) {
      // Convert "CnPurchaseOrder" → "cnPurchaseOrder" (Prisma client property)
      const key = model.name.charAt(0).toLowerCase() + model.name.slice(1);
      map[key] = new Set((model.fields ?? []).map((f: any) => String(f.name)));
    }
  } catch {
    // dmmf unavailable — degrade to empty so every conditional update is skipped
  }
  return map;
})();

function pickExistingFields(
  modelKey: string,
  candidate: Record<string, unknown>,
): Record<string, unknown> {
  const fields = FIELDS_BY_MODEL[modelKey];
  if (!fields || fields.size === 0) return candidate;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(candidate)) {
    if (fields.has(k)) out[k] = v;
  }
  return out;
}

// ─── Main handler ──────────────────────────────────────────────────────

export async function handleApprovalAction(
  req: NextRequest,
  opts: HandleApprovalOptions,
): Promise<NextResponse> {
  // ─── Permission gate ──────────────────────────────────────────────
  const ctxOrResponse = await requirePermission(opts.requiredPermission);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  // ─── Rate limit ───────────────────────────────────────────────────
  const limited = await rateLimit({ ...LIMITS.APPROVAL, req, identifier: ctx.userId });
  if (limited.blocked) {
    logger.warn({
      msg: "rate_limited",
      route: `${opts.entityType}.approval`,
      userId: ctx.userId,
    });
    return limited.response!;
  }

  // ─── Parse body ───────────────────────────────────────────────────
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok for plain approve */
  }
  const action = (body.action ?? "approve") as ApprovalAction;
  const comments = String(body.comments ?? "").trim();

  if (!["approve", "reject", "return"].includes(action)) {
    return err("INVALID_ACTION", `Unknown action: ${action}`, 400);
  }
  if ((action === "reject" || action === "return") && !comments) {
    return err(
      "COMMENT_REQUIRED",
      `Comments are required for ${action} actions.`,
      400,
    );
  }

  // ─── Locate entity ────────────────────────────────────────────────
  const model = (db as any)[opts.prismaModel];
  if (!model) {
    logger.error({ msg: "approval_unknown_model", prismaModel: opts.prismaModel });
    return err("INTERNAL", `Unknown Prisma model: ${opts.prismaModel}`, 500);
  }

  const entity = await model.findFirst({
    where: { id: opts.entityId, tenantId: ctx.tenantId, orgId: ctx.orgId },
    ...(opts.include ? { include: opts.include } : {}),
  });
  if (!entity) {
    return err(
      `${opts.entityType.toUpperCase()}_NOT_FOUND`,
      `${opts.entityType} not found`,
      404,
    );
  }

  // ─── Check transition ─────────────────────────────────────────────
  const currentStatus = String(entity.status ?? "draft").toLowerCase();
  const allowedFrom = opts.transitions[action];
  if (!allowedFrom || !allowedFrom.includes(currentStatus)) {
    logger.warn({
      msg: "approval_conflict",
      entityType: opts.entityType,
      entityId: opts.entityId,
      currentStatus,
      action,
      userId: ctx.userId,
    });
    return err(
      "APPROVAL_CONFLICT",
      `Cannot ${action} — ${opts.entityType} is currently in '${currentStatus}' state. ` +
        (entity.approvedBy ? `Already acted on by ${entity.approvedBy}.` : ""),
      409,
      {
        currentStatus,
        priorActor: entity.approvedBy ?? null,
        priorActionAt: entity.approvedAt ?? null,
      },
    );
  }

  // ─── Compute new status ───────────────────────────────────────────
  let newStatus: string;
  if (action === "approve") {
    newStatus = opts.nextStatusOnApprove
      ? opts.nextStatusOnApprove(currentStatus)
      : "approved";
  } else if (action === "reject") {
    newStatus = opts.rejectStatus ?? "rejected";
  } else {
    newStatus = opts.returnStatus ?? "returned";
  }

  const now = new Date();
  const actorName = ctx.userName || ctx.userEmail || ctx.userId;

  // Build the candidate update payload. `pickExistingFields` strips
  // anything the target model doesn't actually have — so PO/RFQ only get
  // status + updatedBy, Material Issue gets the full audit set, and
  // Stock Reconciliation gets the approvedById FK variant.
  const candidate: Record<string, unknown> = {
    updatedBy: ctx.userId,
  };
  if (action === "approve") {
    candidate.approvedBy = actorName;
    candidate.approvedById = ctx.userId;
    candidate.approvedAt = now;
  } else if (action === "reject") {
    candidate.rejectedBy = actorName;
    candidate.rejectedById = ctx.userId;
    candidate.rejectedAt = now;
    candidate.rejectionReason = comments;
  } else {
    candidate.returnedBy = actorName;
    candidate.returnedById = ctx.userId;
    candidate.returnedAt = now;
    candidate.returnReason = comments;
  }
  const updateData: Record<string, unknown> = {
    status: newStatus,
    ...pickExistingFields(opts.prismaModel, candidate),
  };

  // ─── Run side effect + status flip in a single transaction ───────
  let updatedEntity: any;
  try {
    updatedEntity = await db.$transaction(async (tx: any) => {
      if (action === "approve" && opts.onApproved) {
        await opts.onApproved(entity, tx, ctx);
      }
      const updated = await tx[opts.prismaModel].update({
        where: { id: entity.id },
        data: updateData,
      });
      await recordAudit(tx, ctx, {
        entityType: opts.entityType,
        entityId: entity.id,
        action,
        changes: {
          fromStatus: currentStatus,
          toStatus: newStatus,
          comments: comments || undefined,
        },
      });
      return updated;
    });
  } catch (e: any) {
    logger.error({
      msg: "approval_failed",
      entityType: opts.entityType,
      entityId: opts.entityId,
      action,
      err: e,
    });
    // Map typed domain errors to HTTP; unknown errors become 500
    if (e?.code && e?.httpStatus) {
      return err(e.code, e.message ?? "Approval failed", e.httpStatus);
    }
    return err("APPROVAL_FAILED", e?.message ?? "Approval failed", 500);
  }

  logger.info({
    msg: "approval_action_completed",
    entityType: opts.entityType,
    entityId: opts.entityId,
    action,
    fromStatus: currentStatus,
    toStatus: newStatus,
    userId: ctx.userId,
  });

  return ok({
    id: updatedEntity.id,
    entityType: opts.entityType,
    action,
    fromStatus: currentStatus,
    toStatus: newStatus,
    entity: updatedEntity,
  });
}
