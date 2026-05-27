import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  createEstimation,
  listEstimations,
} from "@/lib/projects/estimation-repository";

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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
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
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!hasMatrixAction(ctx, "pm.estimation", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for pm.estimation`, 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Resolve the project so we can denormalise its name onto the row
  // — keeps CSV exports + list rendering readable without a join.
  const project: any = await (db as any).cnProject.findFirst({
    where: {
      id: params.projectId,
      orgId: ctx.orgId,
    },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${params.projectId} not found` },
      { status: 404 },
    );
  }

  if (!body.boqItemId || !body.boqNo) {
    return NextResponse.json(
      { error: "boqItemId and boqNo are required" },
      { status: 400 },
    );
  }

  const materials: any[] = Array.isArray(body.materials) ? body.materials : [];
  if (materials.length === 0) {
    return NextResponse.json(
      { error: "At least one material line is required" },
      { status: 400 },
    );
  }

  const record = await createEstimation({
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    projectId: params.projectId,
    projectName: project.name,
    boqItemId: body.boqItemId,
    boqNo: body.boqNo,
    boqDescription: body.boqDescription ?? null,
    boqQuantity: body.boqQuantity ?? null,
    boqUnit: body.boqUnit ?? null,
    phase: body.phase ?? "Foundation",
    status: body.status ?? "draft",
    materials,
  });

  return NextResponse.json(record, { status: 201 });
}
