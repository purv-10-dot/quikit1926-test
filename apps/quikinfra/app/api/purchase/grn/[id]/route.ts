import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { findGRNById, type EnrichedGRN } from "@/lib/purchase/grn-repository";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
} from "@/lib/approvals/approval-dto";

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

  let grn: EnrichedGRN | null = null;
  try {
    grn = await findGRNById(ctx.orgId, params.id);
  } catch (e) {
    console.warn(
      "[grn.get] Prisma lookup failed:",
      e instanceof Error ? e.message : e,
    );
  }
  if (!grn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Approval timeline — same shape PR / Indent / RFQ / PO use, so the
  // detail page can reuse the timeline renderer.
  let approval: ApprovalDto | null = null;
  if (grn.approvalId) {
    try {
      const instance = await db.cnApprovalInstance.findFirst({
        where: { id: grn.approvalId },
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
        "[grn.get] approval timeline lookup failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  const grnApprovedBy = (grn as { approvedBy?: string | null }).approvedBy;
  const auditNames = await resolveUserNames([
    grn.createdBy,
    grn.updatedBy,
    grnApprovedBy,
  ]);
  return NextResponse.json({
    ...grn,
    approval,
    createdByName: auditNames.get(grn.createdBy) ?? grn.createdBy,
    updatedByName: auditNames.get(grn.updatedBy) ?? grn.updatedBy,
    approvedByName: grnApprovedBy
      ? auditNames.get(grnApprovedBy) ?? grnApprovedBy
      : null,
  });
}
