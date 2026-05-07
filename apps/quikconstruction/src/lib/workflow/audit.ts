/**
 * Audit Logging
 *
 * Thin wrapper around CnAuditLog. Services call `recordAudit(tx, ctx, ...)`
 * inside a Prisma transaction to guarantee the audit row is written atomically
 * with the state change — either both succeed or neither.
 *
 * The tx parameter is REQUIRED. If you find yourself wanting to "log and
 * return", make it a separate transaction so the caller still sees one
 * atomic unit.
 */

import type { TenantContext } from "@/lib/auth/context";

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string; // create | update | delete | approve | reject | reverse | status_change | import | lock | unlock
  changes?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Record an audit entry. Pass the active Prisma tx client (from
 * `db.$transaction(async (tx) => ...)`) so the log is in the same txn.
 */
export async function recordAudit(
  tx: any,
  ctx: TenantContext,
  entry: AuditEntry
): Promise<void> {
  await tx.cnAuditLog.create({
    data: {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      userId: ctx.userId,
      changes: entry.changes ?? undefined,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/**
 * Record an approval action in CnApprovalHistory. Mirrors recordAudit but
 * uses the approval-specific history table for richer workflow queries.
 *
 * Enforces the business rule: reject/return actions must carry a comment.
 */
export class ApprovalActionError extends Error {
  code: string;
  httpStatus = 400;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ApprovalActionError";
  }
}

export interface ApprovalAction {
  instanceId: string;
  stepOrder: number;
  action: "approve" | "reject" | "return" | "reverse";
  comments?: string;
}

export async function recordApprovalAction(
  tx: any,
  ctx: TenantContext,
  action: ApprovalAction
): Promise<void> {
  if (
    (action.action === "reject" || action.action === "return") &&
    !action.comments?.trim()
  ) {
    throw new ApprovalActionError(
      "COMMENT_REQUIRED",
      `Comments are required for ${action.action} actions`
    );
  }

  await tx.cnApprovalHistory.create({
    data: {
      instanceId: action.instanceId,
      stepOrder: action.stepOrder,
      action: action.action,
      actionById: ctx.userId,
      comments: action.comments ?? null,
    },
  });
}
