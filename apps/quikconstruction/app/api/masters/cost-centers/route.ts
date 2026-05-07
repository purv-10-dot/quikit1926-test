import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  listCostCenters,
  countCostCenters,
  createCostCenter,
} from "@/lib/masters/cost-centers-repository";
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
      (paging) => listCostCenters({ ...baseOpts, ...paging }),
      () => countCostCenters(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/cost-centers.GET] failed:", err);
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
    return NextResponse.json({ error: "Cost center code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Cost center name is required" }, { status: 400 });
  }

  try {
    const record = await createCostCenter({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      projectId: body.projectId,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A cost center with this code already exists" }, { status: 409 });
    }
    console.error("[cost-centers.create] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to create cost center" }, { status: 500 });
  }
}
