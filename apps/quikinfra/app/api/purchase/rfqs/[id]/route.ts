import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { findRfqById, softDeleteRfq } from "@/lib/purchase/rfq-repository";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { db } from "@/lib/db";

/**
 * RFQ per-row endpoints — Postgres-backed.
 *
 * GET    — fetch one, tenant-scoped, enriched with approval instance
 *          so the detail page can render the same live timeline that
 *          PR and Indent use.
 * DELETE — soft delete via `status = "inactive"`.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findRfqById(ctx.orgId, params.id);
  if (!row || row.status === "inactive") {
    return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  }

  // Same fan-out PR and Indent use — inline the approval instance
  // + history + workflow steps for the detail page timeline.
  let approval: any = null;
  if (row.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: {
        history: { orderBy: { actionAt: "asc" } },
        workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
      },
    });
    if (instance) {
      const userIds = Array.from(
        new Set<string>([
          instance.requestedById,
          ...instance.history.map((h: any) => h.actionById),
          ...(instance.workflow.steps
            .map((s: any) => s.approverUserId)
            .filter(Boolean) as string[]),
        ]),
      );
      const nameById = await resolveUserNames(userIds);

      approval = {
        id: instance.id,
        status: instance.status,
        currentStepOrder: instance.currentStepOrder,
        completedAt: instance.completedAt?.toISOString?.() ?? null,
        requestedAt: instance.requestedAt.toISOString(),
        requestedById: instance.requestedById,
        requestedByName: nameById.get(instance.requestedById) ?? "User",
        workflow: {
          id: instance.workflow.id,
          name: instance.workflow.name,
          steps: instance.workflow.steps.map((s: any) => ({
            stepOrder: s.stepOrder,
            approverRoleId: s.approverRoleId,
            approverUserId: s.approverUserId,
            approverUserName: s.approverUserId
              ? (nameById.get(s.approverUserId) ?? null)
              : null,
          })),
        },
        history: instance.history.map((h: any) => ({
          stepOrder: h.stepOrder,
          action: h.action,
          actionById: h.actionById,
          actionByName: nameById.get(h.actionById) ?? "User",
          actionAt: h.actionAt.toISOString(),
          comments: h.comments,
        })),
      };
    }
  }

  // Resolve createdBy / updatedBy ids → display names so the audit
  // card on the detail page shows a human name instead of a cuid.
  const auditNames = await resolveUserNames([row.createdBy, row.updatedBy]);
  return NextResponse.json({
    ...row,
    approval,
    createdByName: auditNames.get(row.createdBy) ?? row.createdBy,
    updatedByName: auditNames.get(row.updatedBy) ?? row.updatedBy,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.rfq", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.rfq", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for purchase.rfq`, 403);
  }

  const existing = await findRfqById(ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  const guard = requireOwnership(existing, ctx, "RFQ");
  if (guard) return guard;

  const ok = await softDeleteRfq(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "RFQ not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
