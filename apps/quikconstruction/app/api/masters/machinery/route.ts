import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  listMachinery,
  countMachinery,
  createMachinery,
} from "@/lib/masters/machinery-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
    const baseOpts = {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      search,
    };
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listMachinery({ ...baseOpts, ...paging }),
      () => countMachinery(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/machinery.GET] failed:", err);
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
    return NextResponse.json({ error: "Machinery name is required" }, { status: 400 });
  }
  if (!body?.type || !String(body.type).trim()) {
    return NextResponse.json({ error: "Machinery type is required" }, { status: 400 });
  }
  try {
    const record = await createMachinery({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      type: body.type,
      make: body.make,
      model: body.model,
      registrationNo: body.registrationNo,
      projectId: body.projectId,
      locationId: body.locationId,
      fuelType: body.fuelType,
      capacity: body.capacity,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Machinery with this code already exists" }, { status: 409 });
    }
    console.error("[machinery.create] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to create machinery" }, { status: 500 });
  }
}
