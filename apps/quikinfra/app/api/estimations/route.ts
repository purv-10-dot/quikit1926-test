import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listEstimations } from "@/lib/projects/estimation-repository";
import { db } from "@/lib/db";
import { canActOnCurrentStep } from "@/lib/approvals/workflow-rbac";

/**
 * Flat estimation listing used by the Material Estimation page so it
 * can show every estimation without forcing the user to pick a project
 * first.
 *
 * Optional query params:
 *   ?projectId=…  — filter to one project
 *   ?search=…     — case-insensitive match on boqNo/description/phase
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? "";
  const search = searchParams.get("search")?.toLowerCase() ?? "";

  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  // Per-user project scoping applied at the repository layer so a user
  // can never use the query string to see a project they aren't
  // assigned to.
  const data = await listEstimations(ctx.orgId, {
    projectId: projectId || null,
    search: search || null,
    allowedProjectIds: ctx.projectIds ?? null,
  });

  // Per-row Approve/Reject visibility — driven by the workflow's current
  // step, not the caller's role. Batch-load every pending instance + its
  // workflow.steps in one round-trip, then compute canActOnCurrentStep
  // for each. Rows with no approvalId get false (nothing to act on).
  const approvalIds = data
    .map((r: any) => r.approvalId)
    .filter((id: any): id is string => typeof id === "string" && id.length > 0);

  const instances =
    approvalIds.length === 0
      ? []
      : await (db as any).cnApprovalInstance.findMany({
          where: { id: { in: approvalIds }, orgId: ctx.orgId },
          include: {
            workflow: { include: { steps: { orderBy: { stepOrder: "asc" } } } },
          },
        });
  const instanceById = new Map<string, any>(
    instances.map((i: any) => [i.id, i]),
  );

  const actor = {
    userId: ctx.userId,
    roleKey: ctx.roleKey,
    projectIds: ctx.projectIds,
  };
  const decorated = data.map((row: any) => {
    const instance = row.approvalId ? instanceById.get(row.approvalId) : null;
    return {
      ...row,
      canActOnCurrentStep: instance
        ? canActOnCurrentStep(actor, instance, row.projectId ?? null)
        : false,
    };
  });

  return NextResponse.json({ data: decorated, total: decorated.length });
}
