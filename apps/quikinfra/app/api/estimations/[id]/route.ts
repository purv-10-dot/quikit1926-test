import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { requireOwnership } from "@/lib/auth/ownership";
import { resolveUserNames } from "@/lib/users/resolve-names";
import {
  deleteEstimation,
  findEstimationById,
  updateEstimation,
} from "@/lib/projects/estimation-repository";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";
import {
  APPROVAL_INSTANCE_INCLUDE,
  buildApprovalDto,
  type ApprovalDto,
  type ApprovalInstanceFull,
} from "@/lib/approvals/approval-dto";

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

  const row = await findEstimationById(ctx.orgId, params.id);
  if (!row) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
  }

  // Fan out to the approval instance (if any) so the detail view can
  // render a real timeline — same shape as the PR detail route so the
  // shared ApprovalTimeline component renders without adapter code.
  let approval: ApprovalDto | null = null;
  let instance: ApprovalInstanceFull | null = null;
  if (row.approvalId) {
    instance = await db.cnApprovalInstance.findFirst({
      where: { id: row.approvalId, orgId: ctx.orgId },
      include: APPROVAL_INSTANCE_INCLUDE,
    });
  }

  // Single user-name lookup feeding both the Audit card (createdBy /
  // updatedBy) and the Approval Timeline (requester, approvers, history
  // actors). One round-trip beats two.
  const userIdsToResolve = new Set<string>();
  if (row.createdBy) userIdsToResolve.add(row.createdBy);
  if (row.updatedBy) userIdsToResolve.add(row.updatedBy);
  if (row.approvedBy) userIdsToResolve.add(row.approvedBy);
  if (instance) {
    if (instance.requestedById) userIdsToResolve.add(instance.requestedById);
    for (const h of instance.history) {
      if (h.actionById) userIdsToResolve.add(h.actionById);
    }
    for (const s of instance.workflow.steps) {
      if (s.approverUserId) userIdsToResolve.add(s.approverUserId);
    }
  }
  const nameById = await resolveUserNames(Array.from(userIdsToResolve));

  if (instance) {
    const callerCanActOnCurrentStep = canActOnCurrentStep(
      {
        userId: ctx.userId,
        roleKey: ctx.roleKey,
        projectIds: ctx.projectIds,
      },
      instance,
      row.projectId ?? null,
    );

    approval = buildApprovalDto(instance, nameById, callerCanActOnCurrentStep);
  }

  const createdByName = row.createdBy ? nameById.get(row.createdBy) : null;
  const updatedByName = row.updatedBy ? nameById.get(row.updatedBy) : null;
  const approvedByName = row.approvedBy
    ? nameById.get(row.approvedBy) ?? row.approvedBy
    : null;

  return NextResponse.json({
    ...row,
    createdByName: createdByName ?? null,
    updatedByName: updatedByName ?? null,
    approvedByName,
    approval,
  });
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!hasMatrixAction(ctx, "pm.estimation", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for pm.estimation`, 403);
  }

  const existing = await findEstimationById(ctx.orgId, id);
  if (!existing) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "estimation");
  if (guard) return guard;

  const body = await req.json();

  // Strip server-owned fields; never let the client overwrite identity
  // or audit columns.
  const {
    id: _a,
    orgId: _c,
    createdAt: _d,
    createdBy: _e,
    approvalId: _f,
    ...safe
  } = body ?? {};

  const next = await updateEstimation(id, {
    orgId: ctx.orgId,
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
  if (!hasMatrixAction(ctx, "pm.estimation", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for pm.estimation`, 403);
  }

  const existing = await findEstimationById(ctx.orgId, params.id);
  if (!existing) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
  }
  const guard = requireOwnership(existing, ctx, "estimation");
  if (guard) return guard;

  const ok = await deleteEstimation(ctx.orgId, params.id);
  if (!ok) {
    return NextResponse.json({ error: "Estimation not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
