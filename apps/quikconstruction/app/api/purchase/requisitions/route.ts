import { NextRequest, NextResponse } from "next/server";
import { buildMRLines } from "@/lib/purchase-engine";
import { validateMRDates, PurchaseValidationError } from "@/lib/purchase-service";
import { getTenantContext } from "@/lib/auth/context";
import { findProjectById } from "@/lib/masters/projects-repository";
import {
  listPRs,
  createPR,
  nextPrNumber,
  withPrNumberRetry,
} from "@/lib/purchase/pr-repository";
import { parsePagination } from "@/lib/http/pagination";

/**
 * Purchase Requisition API — Postgres-backed.
 *
 * Storage: `purchase_requisitions` + `purchase_requisition_lines`
 * via Prisma. Masters (projects/items/uoms/work categories/locations)
 * still live in demo-store; the repository joins them in at read time.
 *
 * Scoping: super admin (ctx.projectIds undefined) sees everything;
 * non-admin with non-empty projectsAssigned is filtered to those projects.
 */

export async function GET(req: NextRequest) {
  try {  
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const search = searchParams.get("search") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    // Pagination is opt-in: `?page=` or `?pageSize=` activates it. Without
    // those params the route returns the legacy "all rows" shape so any
    // caller that hasn't migrated yet keeps working.
    const p = parsePagination(req);
    const data = await listPRs({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      projectIds: ctx.projectIds ?? null,
      status: status || undefined,
      projectId: projectId || undefined,
      search: search || undefined,
      ...(p.paginated ? { take: p.take, skip: p.skip } : {}),
    });
    if (p.paginated) {
      return NextResponse.json({
        data,
        total: data.length,
        page: p.page,
        pageSize: p.pageSize,
        hasMore: data.length === p.pageSize,
      });
    }
    return NextResponse.json({ data, total: data.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[purchase/requisitions.GET] failed:", err);
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
  if (!body.projectId) {
    return NextResponse.json({ error: "Project is required" }, { status: 400 });
  }

  // Projects live in Postgres (projects) — the legacy demo-store
  // resolver returned 404 for any DB-only project. Look up by tenant
  // so a stale id from a different tenant can't slip through.
  const project = await findProjectById(ctx.tenantId, body.projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const projectCode = project.code ?? "SITE";

  const lines = buildMRLines(body.lines ?? [], body.projectId);

  const mrDate = new Date();
  const mrDateStr = mrDate.toISOString().split("T")[0];
  let isUrgent = body.isUrgent ?? false;
  if (body.requiredDate) {
    try {
      const dateCheck = validateMRDates(mrDateStr, body.requiredDate);
      if (dateCheck.isUrgent) isUrgent = true;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (err instanceof PurchaseValidationError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
      }
    }
  }

  const allAvailable = lines.every((l: any) => l.stockCheckStatus === "AVAILABLE");
  const anyInsufficient = lines.some(
    (l: any) => l.stockCheckStatus === "INSUFFICIENT" || l.stockCheckStatus === "PARTIAL",
  );
  const stockCheckSummary = allAvailable
    ? "ALL_AVAILABLE"
    : anyInsufficient ? "PROCUREMENT_NEEDED" : "MIXED";

  const estimatedTotal = lines.reduce(
    (sum: number, l: any) => sum + (parseFloat(l.estimatedAmount) || 0),
    0,
  );

  try {
    const record = await withPrNumberRetry(
      () => nextPrNumber(ctx.tenantId, ctx.orgId, projectCode),
      (prNumber) =>
        createPR({
          tenantId: ctx.tenantId,
          orgId: ctx.orgId,
          prNumber,
          projectId: body.projectId,
          requestedById: ctx.userId,
          requestDate: mrDate,
          requiredDate: body.requiredDate ? new Date(body.requiredDate) : null,
          purpose: body.purpose ?? null,
          isUrgent,
          urgencyJustification: body.urgencyJustification ?? null,
          workCategoryId: body.workCategoryId || null,
          deliveryLocationId: body.deliveryLocationId || null,
          estimatedTotal: Math.round(estimatedTotal),
          stockCheckSummary,
          status: "draft",
          createdBy: ctx.userId,
          lines,
        }),
    );
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.error("[PR.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create PR" },
      { status: 500 },
    );
  }
}
