import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { findPOById, softDeletePO } from "@/lib/purchase/po-repository";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
} from "@/lib/approvals/approval-dto";

/**
 * GET    /api/purchase/orders/:id — fetch one PO (Postgres-backed) plus
 *                                   its approval timeline when present.
 * DELETE /api/purchase/orders/:id — soft-delete (status='cancelled').
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.po", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const po = await findPOById(ctx.orgId, params.id);
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let approval: ApprovalDto | null = null;
  if (po.approvalId) {
    try {
      const instance = await db.cnApprovalInstance.findFirst({
        where: { id: po.approvalId },
        include: APPROVAL_INSTANCE_INCLUDE,
      });
      if (instance) {
        const userIds = Array.from(
          new Set<string>([
            instance.requestedById,
            ...instance.history.map((h) => h.actionById),
            ...(instance.workflow.steps
              .map((s) => s.approverUserId)
              .filter(Boolean) as string[]),
          ]),
        );
        const nameById = await resolveUserNames(userIds);
        approval = buildApprovalDto(instance, nameById);
      }
    } catch (e) {
      console.warn(
        "[po.get] approval timeline lookup failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const auditNames = await resolveUserNames([po.createdBy, po.updatedBy]);
  return NextResponse.json({
    ...po,
    approval,
    createdByName: auditNames.get(po.createdBy) ?? po.createdBy,
    updatedByName: auditNames.get(po.updatedBy) ?? po.updatedBy,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.po", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.po", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for purchase.po`, 403);
  }

  const existing = await findPOById(ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = requireOwnership(existing, ctx, "purchase order");
  if (guard) return guard;

  const ok = await softDeletePO(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
