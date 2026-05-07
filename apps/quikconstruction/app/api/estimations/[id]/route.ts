import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import {
  deleteEstimation,
  findEstimationById,
  updateEstimation,
} from "@/lib/projects/estimation-repository";

/**
 * Single-item estimation route — used by the grid's Edit and Delete
 * actions. The flat list GET lives in /api/estimations/route.ts and
 * the project-scoped create POST lives in
 * /api/projects/:projectId/estimations/route.ts.
 *
 *   GET    /api/estimations/:id   → full row for the edit drawer +
 *                                   approval instance (if submitted)
 *   PUT    /api/estimations/:id   → replace all editable fields
 *   PATCH  /api/estimations/:id   → partial update (used for soft delete)
 *   DELETE /api/estimations/:id   → hard remove (kept for admin tooling)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const row = await findEstimationById(ctx.tenantId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
  }

  // Fan out to the approval instance (if any) so the detail view can
  // render a real timeline — same shape as the PR detail route so the
  // shared ApprovalTimeline component renders without adapter code.
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

  // Strip server-owned fields; never let the client overwrite identity
  // or audit columns.
  const {
    id: _a,
    tenantId: _b,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    approvalId: _f,
    ...safe
  } = body ?? {};

  const next = await updateEstimation(id, {
    tenantId: ctx.tenantId,
    updatedBy: ctx.userId,
    projectName: safe.projectName,
    boqNo: safe.boqNo,
    boqDescription: safe.boqDescription,
    boqQuantity: safe.boqQuantity,
    boqUnit: safe.boqUnit,
    phase: safe.phase,
    status: safe.status,
    materials: Array.isArray(safe.materials) ? safe.materials : undefined,
  });
  if (!next) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
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
  const ok = await deleteEstimation(ctx.tenantId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
