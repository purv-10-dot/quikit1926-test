import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  deleteStockTransfer,
  findStockTransferById,
  updateStockTransfer,
} from "@/lib/store/stock-transfer-repository";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
  collectApprovalUserIds,
} from "@/lib/approvals/approval-dto";

/**
 * Single Stock Transfer record — backed by Postgres via the
 * stock-transfer repository. Response shape matches the PR / MI /
 * Estimation / Gate Pass / Good Return detail routes so the shared
 * `ApprovalTimeline` component renders uniformly.
 *
 *   GET    /api/store/transfers/:id  → row + joined approval timeline
 *   PATCH  /api/store/transfers/:id  → partial update
 *   PUT    /api/store/transfers/:id  → replace editable fields
 *   DELETE /api/store/transfers/:id  → hard remove (admin tooling)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.transfer", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findStockTransferById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
  }
  if (ctx.projectIds !== undefined && row.sourceProjectId) {
    if (!ctx.projectIds.includes(row.sourceProjectId)) {
      return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
    }
  }

  // Resolve human-readable names for createdBy / updatedBy. The IDs on the
  // row reference either cn_users (real invited accounts) or cn_demo_users
  // (the seeded demo accounts) — look up both tables in one shot so the
  // Audit panel never falls back to a raw CUID.
  const auditNames = await resolveUserNames([
    row.createdBy,
    row.updatedBy,
    row.approvedBy,
  ]);
  const createdByName = row.createdBy ? auditNames.get(row.createdBy) ?? null : null;
  const updatedByName = row.updatedBy ? auditNames.get(row.updatedBy) ?? null : null;
  const approvedByName = row.approvedBy
    ? auditNames.get(row.approvedBy) ?? row.approvedBy
    : null;

  let approval: ApprovalDto | null = null;
  if (row.approvalId) {
    const instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: APPROVAL_INSTANCE_INCLUDE,
    });
    if (instance) {
      const nameById = await resolveUserNames(collectApprovalUserIds(instance));
      const callerCanActOnCurrentStep = canActOnCurrentStep(
        {
          userId: ctx.userId,
          roleKey: ctx.roleKey,
          projectIds: ctx.projectIds,
        },
        instance,
        row.sourceProjectId ?? null,
      );
      approval = buildApprovalDto(instance, nameById, callerCanActOnCurrentStep);
    }
  }

  return NextResponse.json({
    ...row,
    createdByName,
    updatedByName,
    approvedByName,
    approval,
  });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireStoreAction("construction.transfer", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.transfer", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.transfer`, 403);
  }

  const existing = await findStockTransferById(ctx.orgId, id);
  if (!existing) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "stock transfer");
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

  const next = await updateStockTransfer(id, {
    orgId: ctx.orgId,
    updatedBy: ctx.userId,
    transferType: safe.transferType,
    transferReason: safe.transferReason,
    transferDate: safe.transferDate ? new Date(safe.transferDate) : undefined,
    sourceProjectName: safe.sourceProjectName,
    destinationProjectName: safe.destinationProjectName,
    fromLocationName: safe.fromLocationName,
    fromState: safe.fromState,
    fromCity: safe.fromCity,
    toLocationName: safe.toLocationName,
    toState: safe.toState,
    toCity: safe.toCity,
    vehicleNo: safe.vehicleNo,
    dispatchDateTime: safe.dispatchDateTime
      ? new Date(safe.dispatchDateTime)
      : undefined,
    estTransitDays: safe.estTransitDays,
    transactionAmount: safe.transactionAmount,
    interstateTransfer:
      safe.interstateTransfer === true || safe.interstateTransfer === "true"
        ? true
        : safe.interstateTransfer === false ||
            safe.interstateTransfer === "false"
          ? false
          : undefined,
    chargeableTransfer:
      safe.chargeableTransfer === true || safe.chargeableTransfer === "true"
        ? true
        : safe.chargeableTransfer === false ||
            safe.chargeableTransfer === "false"
          ? false
          : undefined,
    ewayBillNo: safe.ewayBillNo,
    remarks: safe.remarks,
    lines: Array.isArray(safe.lines) ? safe.lines : undefined,
    status: safe.status,
  });
  if (!next) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
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
  const ctxOrResp = await requireStoreAction("construction.transfer", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.transfer", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for store.transfer`, 403);
  }

  const existing = await findStockTransferById(ctx.orgId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "stock transfer");
  if (guard) return guard;

  const ok = await deleteStockTransfer(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
