import { requireStoreAction } from "@/lib/auth/requireStoreAction";
import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { db } from "@/lib/db";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  deleteGatePass,
  findGatePassById,
  updateGatePass,
} from "@/lib/store/gate-pass-repository";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
} from "@/lib/approvals/approval-dto";

/**
 * Single Gate Pass record — backed by Postgres via the gate-pass
 * repository. Same shape PR / Estimation / Material Issue expose so
 * the detail page can render with the shared `ApprovalTimeline`.
 *
 *   GET    /api/store/gate-passes/:id  → row + joined approval timeline
 *   PATCH  /api/store/gate-passes/:id  → partial update
 *   PUT    /api/store/gate-passes/:id  → replace editable fields
 *   DELETE /api/store/gate-passes/:id  → hard remove (admin tooling)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireStoreAction("construction.gatepass", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findGatePassById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
  }
  if (ctx.projectIds !== undefined && row.projectId) {
    if (!ctx.projectIds.includes(row.projectId)) {
      return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
    }
  }

  // Join the approval instance (if any) so the detail page can render
  // the timeline without a second fetch. Same shape the PR / MI /
  // Estimation / WO detail routes expose.
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
  // the audit card on the detail page shows readable names instead of
  // the raw cuid. Same fan-out PR / PO / RFQ detail routes use.
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
  const ctxOrResp = await requireStoreAction("construction.gatepass", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.gate_pass", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for store.gate_pass`, 403);
  }

  const existing = await findGatePassById(ctx.orgId, id);
  if (!existing) {
    return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "gate pass");
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

  const next = await updateGatePass(id, {
    orgId: ctx.orgId,
    updatedBy: ctx.userId,
    type: safe.type,
    projectName: safe.projectName,
    locationId: safe.locationId,
    locationName: safe.locationName,
    gatePassDate: safe.gatePassDate ? new Date(safe.gatePassDate) : undefined,
    expectedReturnDate: safe.expectedReturnDate
      ? new Date(safe.expectedReturnDate)
      : undefined,
    referenceType: safe.referenceType,
    referenceNo: safe.referenceNo,
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
    securityGuard: safe.securityGuard,
    materialCondition: safe.materialCondition,
    weighbridgeReading: safe.weighbridgeReading,
    vehiclePhoto: safe.vehiclePhoto,
    purpose: safe.purpose,
    remarks: safe.remarks,
    lines: Array.isArray(safe.lines) ? safe.lines : undefined,
    status: safe.status,
  });
  if (!next) {
    return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
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
  const ctxOrResp = await requireStoreAction("construction.gatepass", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "store.gate_pass", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for store.gate_pass`, 403);
  }

  const existing = await findGatePassById(ctx.orgId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "gate pass");
  if (guard) return guard;

  const ok = await deleteGatePass(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Gate Pass not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
