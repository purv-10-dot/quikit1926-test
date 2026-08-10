import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/context";
import {
  approvalService,
  type ApprovalActionKind,
} from "@/lib/approvals/approval-service";

/**
 * Generic Approval Action Endpoint — Prisma-backed.
 *
 * POST /api/approvals/:instanceId/:action  (approve | reject | return | reverse)
 *
 * Most modules now hit their own entity-specific approve route
 * (e.g. /api/purchase/requisitions/:id/approve), which carries the
 * entity-aware side effects (stock posting on GRN approval, MR-issue
 * auto-creation on PR approval, etc.). This generic endpoint is a thin
 * wrapper around `approvalService.execute` for any caller that already
 * holds an approval instance ID and only needs the status transition +
 * audit trail — no entity-specific side effects.
 *
 * Enforcement is delegated to `approvalService`:
 *   - status gate (instance must be `pending_approval`)
 *   - actor permission (caller must hold the step's required permission)
 *   - double-action guard (same user can't act twice on the same step)
 *   - atomicity (history row + status update inside one Prisma transaction)
 *
 * Body: { comments?: string }
 *   `comments` is mandatory for `reject` and `return` actions.
 */
const ALLOWED_ACTIONS: ApprovalActionKind[] = [
  "approve",
  "reject",
  "return",
  "reverse",
  "master_approve",
];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; action: string } },
) {
  const ctxOrResponse = await requireAuth();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const action = params.action as ApprovalActionKind;
  if (!ALLOWED_ACTIONS.includes(action)) {
    return NextResponse.json(
      { error: `Unknown action: ${params.action}` },
      { status: 400 },
    );
  }

  let body: { comments?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine for plain approve */
  }
  const comments = String(body?.comments ?? "").trim();

  try {
    const result = await approvalService.execute({
      ctx,
      instanceId: params.id,
      action,
      comments: comments || undefined,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const http = approvalService.errorToHttp(e);
    if (http) return NextResponse.json(http.body, { status: http.status });
    console.error("[approvals.action] failed:", e);
    return NextResponse.json(
      { error: toErrorMessage(e, "Approval action failed") },
      { status: 500 },
    );
  }
}
