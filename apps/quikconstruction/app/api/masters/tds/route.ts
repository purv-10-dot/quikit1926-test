import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  listTDSCodes,
  countTDSCodes,
  createTDSCode,
} from "@/lib/masters/tds-codes-repository";
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
      (paging) => listTDSCodes({ ...baseOpts, ...paging }),
      () => countTDSCodes(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/tds.GET] failed:", err);
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
  if (!body?.section || !String(body.section).trim()) {
    return NextResponse.json({ error: "Section is required" }, { status: 400 });
  }
  if (!body?.description || !String(body.description).trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }
  if (body.rate === undefined || body.rate === null || body.rate === "") {
    return NextResponse.json({ error: "Rate is required" }, { status: 400 });
  }

  try {
    const record = await createTDSCode({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      section: body.section,
      description: body.description,
      rate: body.rate,
      thresholdAmount: body.thresholdAmount,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    console.error("[tds.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create TDS code" },
      { status: 500 },
    );
  }
}
