import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  deleteGoodReturn,
  findGoodReturnById,
  updateGoodReturn,
} from "@/lib/store/good-return-repository";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
} from "@/lib/approvals/approval-dto";

/**
 * Single Good Return record — backed by Postgres via the good-return
 * repository. Response shape mirrors PR / MI / Estimation / Gate Pass
 * detail routes so the shared `ApprovalTimeline` renders uniformly.
 *
 *   GET    /api/store/good-returns/:id  → row + joined approval timeline
 *   PATCH  /api/store/good-returns/:id  → partial update
 *   PUT    /api/store/good-returns/:id  → replace editable fields
 *   DELETE /api/store/good-returns/:id  → hard remove (admin tooling)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.return", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findGoodReturnById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  if (ctx.projectIds !== undefined && row.projectId) {
    if (!ctx.projectIds.includes(row.projectId)) {
      return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
    }
  }

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

  // Resolve createdBy / updatedBy / approvedBy ids → display names so
  // the audit card on the detail page renders human names instead of
  // the raw cuid. Same pattern PR / PO / RFQ / Gate Pass detail routes
  // use. The cuid regex guard skips any non-cuid values stored as plain
  // strings on legacy rows.
  const auditIds = [row.createdBy, row.updatedBy, row.approvedBy]
    .filter(
      (v): v is string =>
        typeof v === "string" && v.length > 0 && /^c[a-z0-9]{20,}$/i.test(v),
    );
  const auditNames = auditIds.length
    ? await resolveUserNames(auditIds)
    : new Map<string, string>();

  return NextResponse.json({
    ...row,
    approval,
    createdByName: auditNames.get(row.createdBy) ?? row.createdBy,
    updatedByName: auditNames.get(row.updatedBy) ?? row.updatedBy,
    approvedByName: row.approvedBy
      ? (auditNames.get(row.approvedBy) ?? row.approvedBy)
      : null,
  });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireStoreAction("construction.return", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.good_return", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.good_return`, 403);
  }

  const existing = await findGoodReturnById(ctx.orgId, id);
  if (!existing) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "good return");
  if (guard) return guard;

  const body = await req.json();
  const {
    id: _a,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    approvalId: _f,
    ...safe
  } = body ?? {};

  const next = await updateGoodReturn(id, {
    orgId: ctx.orgId,
    updatedBy: ctx.userId,
    projectName: safe.projectName,
    locationId: safe.locationId,
    locationName: safe.locationName,
    vendorName: safe.vendorName,
    grnNumber: safe.grnNumber,
    returnDate: safe.returnDate ? new Date(safe.returnDate) : undefined,
    reason: safe.reason,
    remarks: safe.remarks,
    // Dispatch paperwork — editable via the detail drawer once a
    // follow-up lands the in-place edit UI.
    vehicleNo: safe.vehicleNo,
    driverName: safe.driverName,
    driverMobileNo: safe.driverMobileNo,
    challanNo: safe.challanNo,
    transactionAmount: safe.transactionAmount,
    intercityTransfer:
      safe.intercityTransfer === true || safe.intercityTransfer === "true"
        ? true
        : safe.intercityTransfer === false ||
            safe.intercityTransfer === "false"
          ? false
          : undefined,
    ewayBillNo: safe.ewayBillNo,
    photoAttachment: safe.photoAttachment,
    lines: Array.isArray(safe.lines) ? safe.lines : undefined,
    status: safe.status,
  });
  if (!next) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  return NextResponse.json(next);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleUpdate(req, params.id);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleUpdate(req, params.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.return", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.good_return", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for store.good_return`, 403);
  }

  const existing = await findGoodReturnById(ctx.orgId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "good return");
  if (guard) return guard;

  const ok = await deleteGoodReturn(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
