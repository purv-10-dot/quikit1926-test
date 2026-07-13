import { requirePurchaseAction } from "@/lib/auth/requirePurchaseAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import {
  findIndentById,
  softDeleteIndent,
} from "@/lib/purchase/indent-repository";
import { procurementByIndentLine } from "@/lib/purchase/procurement-status";
import { resolveUserNames } from "@/lib/users/resolve-names";
import { db } from "@/lib/db";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
} from "@/lib/approvals/approval-dto";

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
  let approval: ApprovalDto | null = null;
  if (row.approvalId) {
    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
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
  }

  const rowApprovedBy = (row as { approvedBy?: string | null }).approvedBy;
  const auditNames = await resolveUserNames([
    row.createdBy,
    row.updatedBy,
    row.requestedById,
    rowApprovedBy,
  ]);

  // Enrich each line with its downstream PO/GRN status ("ordered?" /
  // "arrived?"). Traced indent line → PO line → GRN line.
  const indentLines = (row.lines ?? []) as Array<{ id?: string }>;
  const procByLine = await procurementByIndentLine(
    ctx.orgId,
    indentLines.map((l) => l?.id ?? "").filter(Boolean),
  );
  const linesWithProcurement = indentLines.map((l) => ({
    ...l,
    procurement: (l?.id && procByLine.get(l.id)) || null,
  }));

  return NextResponse.json({
    ...row,
    lines: linesWithProcurement,
    approval,
    createdByName: auditNames.get(row.createdBy) ?? row.createdBy,
    updatedByName: auditNames.get(row.updatedBy) ?? row.updatedBy,
    approvedByName: rowApprovedBy
      ? auditNames.get(rowApprovedBy) ?? rowApprovedBy
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
