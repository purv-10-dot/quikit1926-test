import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { parsePagination, paginateDb } from "@/lib/http/pagination";
import {
  listInspections,
  countInspections,
  inspectionResultCounts,
  createInspection,
} from "@/lib/quality/inspections-repository";

/**
 * GET  /api/quality/inspections — list tenant QC inspections.
 * POST /api/quality/inspections — create an inspection (combined checklist).
 */

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const projectId = searchParams.get("projectId") ?? "";

  // Per-user project scoping — applied BEFORE the optional ?projectId query
  // filter so a user can never use the query string to see a project they're
  // not assigned to. `projectIds === undefined` means "all projects".
  const allowed = ctx.projectIds;
  const effectiveProjectId =
    projectId && (!allowed || allowed.includes(projectId)) ? projectId : undefined;

  const baseOpts = {
    orgId: ctx.orgId,
    search,
    projectId: effectiveProjectId,
    projectIds: allowed,
  };

  // KPI tiles (Total / Passed / Failed / Pending) grouped server-side so they
  // stay correct regardless of pagination.
  if (searchParams.get("stats") === "1") {
    const stats = await inspectionResultCounts(baseOpts);
    return NextResponse.json({ stats });
  }

  const result = await paginateDb(
    parsePagination(req),
    (paging) => listInspections({ ...baseOpts, ...paging }),
    () => countInspections(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "quality.home", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for quality.home`, 403);
  }

  const body = await req.json();

  if (!body?.projectId) {
    return NextResponse.json({ error: "Project is required" }, { status: 400 });
  }
  if (!body?.date) {
    return NextResponse.json({ error: "Inspection date is required" }, { status: 400 });
  }
  const inspectionDate = new Date(body.date);
  if (Number.isNaN(inspectionDate.getTime())) {
    return NextResponse.json({ error: "Invalid inspection date" }, { status: 400 });
  }

  const lines = Array.isArray(body?.lines) ? body.lines : [];

  try {
    const record = await createInspection({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      inspectorId: ctx.userId,
      inspectorName: body.inspector ?? null,
      projectId: String(body.projectId),
      inspectionDate,
      boqItem: body.boqItem ?? null,
      checklistName: body.checklistName ?? null,
      category: body.category ?? null,
      result: body.result ?? null,
      status: body.status ?? "Active",
      remarks: body.remarks ?? null,
      items: lines,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create inspection";
    console.error("[quality.inspections.create] failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
