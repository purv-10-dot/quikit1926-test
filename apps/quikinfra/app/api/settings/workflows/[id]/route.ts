import { NextRequest, NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import {
  findWorkflowById,
  updateWorkflow,
  deleteWorkflow,
} from "@/lib/workflows/repository";

/**
 * GET    /api/settings/workflows/:id — fetch one
 * PATCH  /api/settings/workflows/:id — update name / entityType / isActive / steps
 * DELETE /api/settings/workflows/:id — remove workflow + its steps (cascade)
 *
 * v2 permission gate: `construction.workflows` + `manage`.
 * Storage: Postgres.
 */
const auth = withOrgAuthForResource("construction.workflows");

export const GET = auth.manage<{ id: string }>(async (authCtx, _req, { params }) => {
  const wf = await findWorkflowById(authCtx.orgId, params.id);
  if (!wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json(wf);
});

export const PATCH = auth.manage<{ id: string }>(async (
  authCtx,
  req: NextRequest,
  { params },
) => {
  const body = await req.json();
  const isActive =
    body.isActive === undefined
      ? undefined
      : typeof body.isActive === "string"
      ? body.isActive === "true"
      : !!body.isActive;

  // Steps come either as `steps` (preferred) or `lines` (QuickCreateDrawer).
  const rawSteps = Array.isArray(body.steps)
    ? body.steps
    : Array.isArray(body.lines)
    ? body.lines
    : undefined;

  const steps = rawSteps?.map((l: {
    stepOrder?: number | string | null;
    approverRole?: string | null;
    approverUserId?: string | null;
    approverUserIds?: unknown;
    amountThresholdMin?: number | string | null;
  }) => ({
    stepOrder: Number(l.stepOrder) || 1,
    approverRole: l.approverRole ?? null,
    approverUserId: l.approverUserId ?? null,
    approverUserIds: Array.isArray(l.approverUserIds) ? l.approverUserIds : [],
    amountThresholdMin: l.amountThresholdMin ?? null,
  }));

  const updated = await updateWorkflow(authCtx.orgId, params.id, {
    name: body.name,
    entityType: body.entityType,
    // Conditional spread: a body that omits the key must leave the existing
    // master approver alone, while an explicit "" or null clears it.
    ...("masterApproverUserId" in body
      ? {
          masterApproverUserId: body.masterApproverUserId
            ? String(body.masterApproverUserId)
            : null,
        }
      : {}),
    isActive,
    steps,
    updatedBy: authCtx.userId,
  });
  if (!updated) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json(updated);
});

// Alias — some UI callers use PUT.
export const PUT = PATCH;

export const DELETE = auth.manage<{ id: string }>(async (
  authCtx,
  _req,
  { params },
) => {
  const result = await deleteWorkflow(authCtx.orgId, params.id);
  if (result.status === "not_found") {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  if (result.status === "in_use") {
    return NextResponse.json(
      {
        error:
          `Cannot delete: this workflow has ${result.instanceCount} approval ` +
          `record(s). Deactivate it instead, or edit it in place to change steps.`,
      },
      { status: 409 },
    );
  }
  return NextResponse.json({ success: true });
});
