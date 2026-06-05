import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { findGRNById } from "@/lib/purchase/grn-repository";
import { resolveUserNames } from "@/lib/users/resolve-names";

/**
 * GET /api/purchase/grn/:id
 *
 * Returns the GRN row enriched with:
 *   - createdByName / updatedByName (display names for the audit card)
 *   - approval instance + history + workflow steps (for the timeline)
 *
 * GRN is persisted in Prisma via `createGRN`; demo-store fallback is
 * only for any legacy rows that predate the migration.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requirePurchaseAction("construction.grn", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  let grn: any = null;
  try {
    grn = await findGRNById(ctx.orgId, params.id);
  } catch (e) {
    console.warn(
      "[grn.get] Prisma lookup failed:",
      (e as any)?.message ?? e,
    );
  }
  if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Approval timeline — same shape PR / Indent / RFQ / PO use, so the
  // detail page can reuse the timeline renderer.
  let approval: any = null;
  if (grn.approvalId) {
    try {
      const instance = await (db as any).cnApprovalInstance.findFirst({
        where: { id: grn.approvalId },
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
    } catch (e) {
      console.warn(
        "[grn.get] approval timeline lookup failed:",
        (e as any)?.message ?? e,
      );
    }
  }

  const auditNames = await resolveUserNames([
    grn.createdBy,
    grn.updatedBy,
    (grn as any).approvedBy,
  ]);
  return NextResponse.json({
    ...grn,
    approval,
    createdByName: auditNames.get(grn.createdBy) ?? grn.createdBy,
    updatedByName: auditNames.get(grn.updatedBy) ?? grn.updatedBy,
    approvedByName: (grn as any).approvedBy
      ? auditNames.get((grn as any).approvedBy) ?? (grn as any).approvedBy
      : null,
  });
}
