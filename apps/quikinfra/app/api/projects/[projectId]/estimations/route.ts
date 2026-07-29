import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createEstimation,
  listEstimations,
  type EstimationMaterialLine,
} from "@/lib/projects/estimation-repository";
import { assertScopeBelongsToProject } from "@/lib/scope/scope-resolver";
import { scopeErrorResponse } from "@/lib/scope/http";

/**
 * Material Estimation routes, project-scoped.
 *
 * GET  /api/projects/:projectId/estimations
 *      → List every estimation row for this project, newest first.
 *
 * POST /api/projects/:projectId/estimations
 *      → Body: { boqItemId, boqNo, boqDescription, boqQuantity, boqUnit,
 *                phase, status, materials: [...] }
 *        The backend stamps projectId, rolls up totalCost from the
 *        materials array, and writes to Postgres via the repository.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.estimation", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const data = await listEstimations(ctx.orgId, {
    projectId: params.projectId,
    allowedProjectIds: ctx.projectIds ?? null,
  });
  return NextResponse.json({ data, total: data.length });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } },
) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.estimation", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "pm.estimation", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.estimation`, 403);
  }

  let body: {
    boqItemId?: string;
    boqNo?: string;
    scopeType?: string;
    scopeId?: string;
    boqDescription?: string | null;
    boqQuantity?: number | string | null;
    boqUnit?: string | null;
    phase?: string;
    status?: string;
    materials?: EstimationMaterialLine[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve the project so we can denormalise its name onto the row
  // — keeps CSV exports + list rendering readable without a join.
  const project = await db.cnProject.findFirst({
    where: {
      id: params.projectId,
      orgId: ctx.orgId,
    },
    select: { id: true, name: true, executionMode: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${params.projectId} not found` },
      { status: 404 },
    );
  }

  const materials = Array.isArray(body.materials) ? body.materials : [];
  if (materials.length === 0) {
    return NextResponse.json(
      { error: "At least one material line is required" },
      { status: 400 },
    );
  }

  const isFreeScope = project.executionMode === "FREE_SCOPE";

  try {
    let anchor: {
      boqItemId: string | null;
      scopeType: string;
      scopeId: string | null;
      boqNo: string | null;
      boqDescription: string | null;
      boqQuantity: number | string | null;
      boqUnit: string | null;
    };

    if (isFreeScope) {
      if (!body.scopeId) {
        return NextResponse.json(
          { error: "scopeId is required for FREE_SCOPE projects" },
          { status: 400 },
        );
      }
      // Validates the activity exists in this project (throws ScopeError).
      const line = await assertScopeBelongsToProject(
        ctx.orgId,
        params.projectId,
        "ACTIVITY",
        body.scopeId,
      );
      anchor = {
        boqItemId: null,
        scopeType: "ACTIVITY",
        scopeId: line.scopeId,
        boqNo: line.code,
        boqDescription: body.boqDescription ?? line.description,
        boqQuantity: body.boqQuantity ?? line.plannedQty,
        boqUnit: body.boqUnit ?? line.uomId,
      };
    } else {
      if (!body.boqItemId || !body.boqNo) {
        return NextResponse.json(
          { error: "boqItemId and boqNo are required" },
          { status: 400 },
        );
      }
      anchor = {
        boqItemId: body.boqItemId,
        scopeType: "BOQ",
        scopeId: null,
        boqNo: body.boqNo,
        boqDescription: body.boqDescription ?? null,
        boqQuantity: body.boqQuantity ?? null,
        boqUnit: body.boqUnit ?? null,
      };
    }

    const record = await createEstimation({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      projectId: params.projectId,
      projectName: project.name,
      boqItemId: anchor.boqItemId,
      scopeType: anchor.scopeType,
      scopeId: anchor.scopeId,
      boqNo: anchor.boqNo,
      boqDescription: anchor.boqDescription,
      boqQuantity: anchor.boqQuantity,
      boqUnit: anchor.boqUnit,
      phase: body.phase ?? "Foundation",
      status: body.status ?? "draft",
      materials,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    return scopeErrorResponse(e, "projects.estimations.create");
  }
}
