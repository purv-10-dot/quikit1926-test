import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  findIndentById,
  softDeleteIndent,
} from "@/lib/purchase/indent-repository";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { db } from "@/lib/db";

/**
 * Indent per-row endpoints — Postgres-backed.
 *
 * GET    — fetch one, tenant-scoped, enriched with the live approval
 *          instance + history + workflow steps so the detail page can
 *          render the same real timeline PR uses.
 * DELETE — soft delete via `status = "inactive"` so approval history
 *          and any downstream POs stay referentially valid.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.indent", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findIndentById(ctx.orgId, params.id);
  if (!row || row.status === "inactive") {
    return NextResponse.json({ error: "Indent not found" }, { status: 404 });
  }

  // Same fan-out the PR detail route uses — instance + workflow + history,
  // with user names pre-resolved so the client timeline doesn't need a
  // second round-trip for display labels.
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

  const auditNames = await resolveUserNames([
    row.createdBy,
    row.updatedBy,
    row.requestedById,
    (row as any).approvedBy,
  ]);
  return NextResponse.json({
    ...row,
    approval,
    createdByName: auditNames.get(row.createdBy) ?? row.createdBy,
    updatedByName: auditNames.get(row.updatedBy) ?? row.updatedBy,
    approvedByName: (row as any).approvedBy
      ? auditNames.get((row as any).approvedBy) ?? (row as any).approvedBy
      : null,
    requestedByName: row.requestedById
      ? (auditNames.get(row.requestedById) ?? row.requestedById)
      : null,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.indent", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.indent", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for purchase.indent`, 403);
  }

  const existing = await findIndentById(ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Indent not found" }, { status: 404 });
  const guard = requireOwnership(existing, ctx, "indent");
  if (guard) return guard;

  const ok = await softDeleteIndent(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Indent not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
