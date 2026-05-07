import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  listLocations,
  countLocations,
  createLocation,
} from "@/lib/masters/locations-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * Locations list.
 *
 * Filter semantic preserved from legacy route: when ?projectId is supplied,
 * returns rows for that project PLUS rows with no projectId (shared
 * warehouses / head offices). This keeps the PR-create delivery-location
 * dropdown populated even when a project has no dedicated site store yet.
 */
export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const projectId = searchParams.get("projectId") ?? "";
  
    const baseOpts = {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      search,
      projectId: projectId || undefined,
    };
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listLocations({ ...baseOpts, ...paging }),
      () => countLocations(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/locations.GET] failed:", err);
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
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }
  if (!body?.type || !String(body.type).trim()) {
    return NextResponse.json({ error: "Location type is required" }, { status: 400 });
  }
  try {
    const record = await createLocation({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      type: body.type,
      projectId: body.projectId,
      address: body.address,
      city: body.city,
      state: body.state,
      inCharge: body.inCharge,
      capacity: body.capacity,
      itemGroupId: body.itemGroupId,
      itemIds: Array.isArray(body.itemIds) ? body.itemIds : undefined,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A location with this code already exists" }, { status: 409 });
    }
    console.error("[locations.create] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to create location" }, { status: 500 });
  }
}
