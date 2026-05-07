import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import { listUOMs, countUOMs, createUOM } from "@/lib/masters/uoms-repository";
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
      (paging) => listUOMs({ ...baseOpts, ...paging }),
      () => countUOMs(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/uom.GET] failed:", err);
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
  if (!body?.code || !String(body.code).trim()) {
    return NextResponse.json({ error: "UOM code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "UOM name is required" }, { status: 400 });
  }

  try {
    const record = await createUOM({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      type: body.type,
      precision: body.precision,
      isBase: body.isBase,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A UOM with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[uom.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create UOM" },
      { status: 500 },
    );
  }
}
