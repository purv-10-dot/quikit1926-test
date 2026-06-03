import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { findPRById, updatePR, deletePR } from "@/lib/purchase/pr-repository";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { db } from "@/lib/db/prisma";

/**
 * Individual PR operations — Postgres-backed via Prisma.
 *
 * GET    — fetch by id, tenant-scoped.
 * POST   — legacy status-bump to `pending_approval`.
 * PATCH  — edit PR fields (draft state).
 * DELETE — remove PR + its lines (FK cascade).
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.pr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const pr = await findPRById(ctx.orgId, params.id);
  if (!pr) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Fan out to the approval instance (if any) so the detail page can
  // render a real timeline — configured steps with completed/pending
  // markers — instead of the old hardcoded "Step 1 — pending" stub.
  let approval: any = null;
  if (pr.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: pr.approvalId, orgId: ctx.orgId },
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
          ...instance.workflow.steps
            .map((s: any) => s.approverUserId)
            .filter(Boolean) as string[],
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

  const auditNames = await resolveUserNames([pr.createdBy, pr.updatedBy]);
  return NextResponse.json({
    ...pr,
    approval,
    createdByName: auditNames.get(pr.createdBy) ?? pr.createdBy,
    updatedByName: auditNames.get(pr.updatedBy) ?? pr.updatedBy,
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.pr", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.mr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.mr`, 403);
  }
  const existing = await findPRById(ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const updated = await updatePR(ctx.orgId, params.id, {
    status: "pending_approval",
    updatedBy: ctx.userId,
  });
  return NextResponse.json(updated);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.pr", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.mr", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for purchase.mr`, 403);
  }
  const existing = await findPRById(ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = requireOwnership(existing, ctx, "purchase requisition");
  if (guard) return guard;
  const body = await req.json();
  const updated = await updatePR(ctx.orgId, params.id, {
    purpose: body.purpose,
    requiredDate: body.requiredDate ? new Date(body.requiredDate) : undefined,
    isUrgent: body.isUrgent,
    urgencyJustification: body.urgencyJustification,
    workCategoryId: body.workCategoryId,
    deliveryLocationId: body.deliveryLocationId,
    status: body.status,
    updatedBy: ctx.userId,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.pr", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "purchase.mr", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for purchase.mr`, 403);
  }
  const existing = await findPRById(ctx.orgId, params.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const guard = requireOwnership(existing, ctx, "purchase requisition");
  if (guard) return guard;
  const ok = await deletePR(ctx.orgId, params.id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
