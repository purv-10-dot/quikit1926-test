import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db/prisma";
import {
  deleteGoodReturn,
  findGoodReturnById,
  updateGoodReturn,
} from "@/lib/store/good-return-repository";

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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const row = await findGoodReturnById(ctx.tenantId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  if (ctx.projectIds !== undefined && row.projectId) {
    if (!ctx.projectIds.includes(row.projectId)) {
      return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
    }
  }

  let approval: any = null;
  if (row.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, tenantId: ctx.tenantId },
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
  }

  return NextResponse.json({ ...row, approval });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const body = await req.json();
  const {
    id: _a,
    tenantId: _b,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    approvalId: _f,
    ...safe
  } = body ?? {};

  const next = await updateGoodReturn(id, {
    tenantId: ctx.tenantId,
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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const ok = await deleteGoodReturn(ctx.tenantId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Good Return not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
