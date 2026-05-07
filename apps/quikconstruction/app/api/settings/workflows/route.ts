import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listWorkflows, createWorkflow } from "@/lib/workflows/repository";

/**
 * GET  /api/settings/workflows      — list workflows (tenant-scoped)
 * POST /api/settings/workflows      — create workflow + steps
 *
 * Storage: Postgres (`approval_workflows` + `approval_workflow_steps`).
 */

export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get("entityType") ?? undefined;

    const data = await listWorkflows({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      entityType,
    });
    return NextResponse.json({ data, total: data.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[settings/workflows.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();

  // The QuickCreateDrawer ships `isActive` as string "true"/"false".
  const isActive =
    typeof body.isActive === "string" ? body.isActive === "true" : !!(body.isActive ?? true);

  // Line items from QuickCreateDrawer arrive under `lines` — map to steps.
  const steps = Array.isArray(body.lines)
    ? body.lines.map((l: any) => ({
        stepOrder: Number(l.stepOrder) || 1,
        approverRole: l.approverRole ?? null,
        amountThresholdMin: l.amountThresholdMin ?? null,
      }))
    : Array.isArray(body.steps)
    ? body.steps
    : [];

  if (!body.name || !body.entityType) {
    return NextResponse.json(
      { error: "Workflow name and entity type are required" },
      { status: 400 },
    );
  }

  try {
    const record = await createWorkflow({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      name: String(body.name).trim(),
      entityType: String(body.entityType).trim(),
      isActive,
      steps,
      createdBy: ctx.userId,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.error("[workflows.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create workflow" },
      { status: 500 },
    );
  }
}
