import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/context";
import { listWorkflows, createWorkflow } from "@/lib/workflows/repository";

/**
 * GET  /api/settings/workflows      — list workflows (tenant-scoped)
 * POST /api/settings/workflows      — create workflow + steps
 *
 * Storage: Postgres (`cn_approval_workflows` + `cn_approval_workflow_steps`).
 */

export async function GET(req: NextRequest) {
  const ctxOrResponse = await requireSuperAdmin();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType") ?? undefined;
  // `projectId` query param accepts:
  //   omitted        → no filter (admin grid shows Default + every override)
  //   "default"/""   → Default-only (projectId IS NULL)
  //   <projectId>    → that project's overrides only
  const rawProjectId = searchParams.get("projectId");
  let projectIdFilter: string | null | undefined;
  if (rawProjectId === null) {
    projectIdFilter = undefined;
  } else if (rawProjectId === "" || rawProjectId === "default") {
    projectIdFilter = null;
  } else {
    projectIdFilter = rawProjectId;
  }

  const data = await listWorkflows({
    orgId: ctx.orgId,
    entityType,
    projectId: projectIdFilter,
  });
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const ctxOrResponse = await requireSuperAdmin();
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const body = await req.json();

  // The QuickCreateDrawer ships `isActive` as string "true"/"false".
  const isActive =
    typeof body.isActive === "string" ? body.isActive === "true" : !!(body.isActive ?? true);

  // Line items from QuickCreateDrawer arrive under `lines` — map to steps.
  const steps = Array.isArray(body.lines)
    ? body.lines.map((l: any) => ({
        stepOrder: Number(l.stepOrder) || 1,
        approverRole: l.approverRole ?? null,
        approverUserId: l.approverUserId ?? null,
        approverUserIds: Array.isArray(l.approverUserIds) ? l.approverUserIds : [],
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
    // `projectId` on the body: empty string / "default" / null → Default
    // workflow (tenant-wide). Any other string → a project-scoped override.
    const rawProjectId = body.projectId;
    const projectId =
      rawProjectId === undefined ||
      rawProjectId === null ||
      rawProjectId === "" ||
      rawProjectId === "default"
        ? null
        : String(rawProjectId);

    const record = await createWorkflow({
      orgId: ctx.orgId,
      projectId,
      name: String(body.name).trim(),
      entityType: String(body.entityType).trim(),
      isActive,
      steps,
      createdBy: ctx.userId,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    console.error("[workflows.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create workflow" },
      { status: 500 },
    );
  }
}
