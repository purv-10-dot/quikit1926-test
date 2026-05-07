import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { db } from "@/lib/db/prisma";
import {
  deleteStockTransfer,
  findStockTransferById,
  updateStockTransfer,
} from "@/lib/store/stock-transfer-repository";

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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const row = await findStockTransferById(ctx.tenantId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
  }
  if (ctx.projectIds !== undefined && row.sourceProjectId) {
    if (!ctx.projectIds.includes(row.sourceProjectId)) {
      return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
    }
  }

  // Resolve human-readable names for createdBy / updatedBy. The IDs on the
  // row reference either users (real invited accounts) or demo_users
  // (the seeded demo accounts) — look up both tables in one shot so the
  // Audit panel never falls back to a raw CUID.
  const auditUserIds = Array.from(
    new Set<string>([row.createdBy, row.updatedBy].filter(Boolean) as string[]),
  );
  const auditNames = new Map<string, string>();
  if (auditUserIds.length > 0) {
    const [cnUsers, demoUsers] = await Promise.all([
      (db as any).cnUser.findMany({
        where: { id: { in: auditUserIds } },
        select: { id: true, fullName: true },
      }),
      (db as any).cnDemoUser.findMany({
        where: { id: { in: auditUserIds } },
        select: { id: true, name: true },
      }),
    ]);
    // users wins over demo_users when both have the same id (shouldn't
    // happen in practice — CUIDs are unique — but harmless if it does).
    for (const u of demoUsers) auditNames.set(u.id, u.name);
    for (const u of cnUsers) auditNames.set(u.id, u.fullName);
  }
  const createdByName = row.createdBy ? auditNames.get(row.createdBy) ?? null : null;
  const updatedByName = row.updatedBy ? auditNames.get(row.updatedBy) ?? null : null;

  let approval: any = null;
  if (row.approvalId) {
    const instance = await (db as any).cnApprovalInstance.findFirst({
      where: { id: row.approvalId, tenantId: ctx.tenantId },
      select: {
        id: true,
        status: true,
        currentStepOrder: true,
        completedAt: true,
        requestedAt: true,
        requestedById: true,
        history: {
          orderBy: { actionAt: "asc" },
          select: {
            stepOrder: true,
            action: true,
            actionById: true,
            actionAt: true,
            comments: true,
          },
        },
        workflow: {
          select: {
            id: true,
            name: true,
            steps: {
              orderBy: { stepOrder: "asc" },
              select: {
                stepOrder: true,
                approverRoleId: true,
                approverUserId: true,
              },
            },
          },
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
  }

  return NextResponse.json({ ...row, createdByName, updatedByName, approval });
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

  const next = await updateStockTransfer(id, {
    tenantId: ctx.tenantId,
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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  const ok = await deleteStockTransfer(ctx.tenantId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Stock Transfer not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
