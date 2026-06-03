import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listLocations,
  countLocations,
  createLocation,
} from "@/lib/masters/locations-repository";
import { cachedJson } from "@/lib/http/cache";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * Locations list.
 *
 * Filter semantic: when ?projectId is supplied, only returns rows mapped to
 * that project. This keeps the PR-create delivery-location dropdown scoped
 * to the selected project.
 */
export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const projectId = searchParams.get("projectId") ?? "";

  const baseOpts = {
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
  return cachedJson(result, "medium");
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.location", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.location`, 403);
  }
  const body = await req.json();
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Location name is required" }, { status: 400 });
  }
  if (!body?.type || !String(body.type).trim()) {
    return NextResponse.json({ error: "Location type is required" }, { status: 400 });
  }
  try {
    const record = await createLocation({
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
      itemQtyByItemId:
        body.itemQtyByItemId && typeof body.itemQtyByItemId === "object"
          ? body.itemQtyByItemId
          : null,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A location with this code already exists" }, { status: 409 });
    }
    console.error("[locations.create] failed:", err);
    return NextResponse.json({ error: err?.message ?? "Failed to create location" }, { status: 500 });
  }
}
