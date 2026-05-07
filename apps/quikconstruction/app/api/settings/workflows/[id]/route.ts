import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
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
 * Storage: Postgres.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const wf = await findWorkflowById(ctx.tenantId, params.id);
  if (!wf) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json(wf);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

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

  const steps = rawSteps?.map((l: any) => ({
    stepOrder: Number(l.stepOrder) || 1,
    approverRole: l.approverRole ?? null,
    approverUserId: l.approverUserId ?? null,
    amountThresholdMin: l.amountThresholdMin ?? null,
  }));

  const updated = await updateWorkflow(ctx.tenantId, params.id, {
    name: body.name,
    entityType: body.entityType,
    isActive,
    steps,
    updatedBy: ctx.userId,
  });
  if (!updated) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json(updated);
}

// Alias — some UI callers use PUT.
export async function PUT(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  return PATCH(req, ctx);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const ok = await deleteWorkflow(ctx.tenantId, params.id);
  if (!ok) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
