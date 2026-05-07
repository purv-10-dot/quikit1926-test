import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db/prisma";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { findPOById, softDeletePO } from "@/lib/purchase/po-repository";

/**
 * GET    /api/purchase/orders/:id — fetch one PO (Postgres-backed) plus
 *                                   its approval timeline when present.
 * DELETE /api/purchase/orders/:id — soft-delete (status='cancelled').
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const po = await findPOById(ctx.tenantId, params.id);
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let approval: any = null;
  if (po.approvalId) {
    try {
      const instance = await (db as any).cnApprovalInstance.findFirst({
        where: { id: po.approvalId },
        include: {
          history: { orderBy: { actionAt: "asc" } },
          workflow: {
            include: { steps: { orderBy: { stepOrder: "asc" } } },
          },
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
        const users = userIds.length
          ? await (db as any).cnUser.findMany({
              where: { id: { in: userIds } },
              select: { id: true, fullName: true },
            })
          : [];
        const nameById = new Map<string, string>(
          users.map((u: any) => [u.id, u.fullName]),
        );

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
    } catch (e) {
      console.warn(
        "[po.get] approval timeline lookup failed:",
        (e as any)?.message ?? e,
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
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const ok = await softDeletePO(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
