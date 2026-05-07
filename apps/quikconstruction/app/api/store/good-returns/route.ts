import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";
import {
  createGoodReturn,
  listGoodReturns,
  countGoodReturnsForDate,
} from "@/lib/store/good-return-repository";

/**
 * Good Return (vendor returns) — Postgres-backed via the repository.
 *
 * GET  /api/store/good-returns
 *      ?status=…      filter (draft | pending_approval | approved | rejected | dispatched)
 *      ?projectId=…   filter by project
 *      ?search=…      substring match on returnNumber / projectName / vendorName / reason
 *
 * POST /api/store/good-returns
 *      Creates a new return. Auto-assigns `returnNumber` as
 *      GR-<YYYYMMDD>-<seq> per tenant per day, denormalises project /
 *      vendor / location names, and writes via `createGoodReturn`.
 */

export async function GET(req: NextRequest) {
  try {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
    const search = searchParams.get("search") ?? "";

    const data = await listGoodReturns(ctx.tenantId, {
      status: status || null,
      projectId: projectId || null,
      search: search || null,
      allowedProjectIds: ctx.projectIds ?? null,
    });

    return NextResponse.json({ data, total: data.length });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[store/good-returns.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();

  if (!body.projectId) {
    return NextResponse.json(
      { error: "projectId is required" },
      { status: 400 },
    );
  }
  if (!body.vendorId) {
    return NextResponse.json(
      { error: "vendorId is required" },
      { status: 400 },
    );
  }

  // Denormalise project + vendor + location names — the list grid
  // reads these columns directly so it doesn't need a join.
  const project: any = await (db as any).cnProject.findFirst({
    where: { id: body.projectId, tenantId: ctx.tenantId, orgId: ctx.orgId },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: `Project ${body.projectId} not found` },
      { status: 404 },
    );
  }
  const vendor: any = await (db as any).cnVendor.findFirst({
    where: { id: body.vendorId, tenantId: ctx.tenantId, orgId: ctx.orgId },
    select: { id: true, companyName: true, name: true },
  });
  if (!vendor) {
    return NextResponse.json(
      { error: `Vendor ${body.vendorId} not found` },
      { status: 404 },
    );
  }
  let locationName: string | null = body.locationName ?? null;
  if (body.locationId && !locationName) {
    const loc: any = await (db as any).cnLocation.findFirst({
      where: { id: body.locationId, tenantId: ctx.tenantId, orgId: ctx.orgId },
      select: { id: true, name: true },
    });
    locationName = loc?.name ?? null;
  }

  const returnDateStr: string =
    body.returnDate ?? new Date().toISOString().slice(0, 10);
  const todaysCount = await countGoodReturnsForDate(
    ctx.tenantId,
    returnDateStr,
  );
  const compactDate = returnDateStr.replace(/-/g, "");
  const seq = String(todaysCount + 1).padStart(4, "0");
  const returnNumber = body.returnNumber ?? `GR-${compactDate}-${seq}`;

  const lines: any[] = Array.isArray(body.lines) ? body.lines : [];

  const record = await createGoodReturn({
    tenantId: ctx.tenantId,
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    returnNumber,
    projectId: project.id,
    projectName: project.name,
    vendorId: vendor.id,
    vendorName: vendor.companyName || vendor.name || vendor.id,
    locationId: body.locationId ?? null,
    locationName,
    grnId: body.grnId ?? null,
    grnNumber: body.grnNumber ?? null,
    returnDate: new Date(returnDateStr),
    reason: body.reason ?? null,
    remarks: body.remarks ?? null,
    // Dispatch paperwork — preserved through approval + dispatch so
    // the detail page renders what was captured at create time.
    vehicleNo: body.vehicleNo ?? null,
    driverName: body.driverName ?? null,
    driverMobileNo: body.driverMobileNo ?? null,
    challanNo: body.challanNo ?? null,
    transactionAmount: body.transactionAmount ?? null,
    intercityTransfer:
      body.intercityTransfer === true || body.intercityTransfer === "true",
    ewayBillNo: body.ewayBillNo ?? null,
    photoAttachment: body.photoAttachment ?? null,
    lines,
    status: body.status ?? "draft",
  });

  return NextResponse.json(record, { status: 201 });
}
