import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";

import {
  listFinancialYears,
  countFinancialYears,
  createFinancialYear,
} from "@/lib/masters/financial-years-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = { orgId: ctx.orgId, search };

  const result = await paginateDb(
    parsePagination(req),
    (paging) => listFinancialYears({ ...baseOpts, ...paging }),
    () => countFinancialYears(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  if (!body?.label || !String(body.label).trim()) {
    return NextResponse.json({ error: "Financial year label is required" }, { status: 400 });
  }
  if (!body?.startDate) {
    return NextResponse.json({ error: "Start date is required" }, { status: 400 });
  }
  if (!body?.endDate) {
    return NextResponse.json({ error: "End date is required" }, { status: 400 });
  }

  try {
    const record = await createFinancialYear({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      companyId: body.companyId,
      label: body.label,
      startDate: body.startDate,
      endDate: body.endDate,
      isCurrent: body.isCurrent,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A financial year with this label already exists" },
        { status: 409 },
      );
    }
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "The selected company does not exist" },
        { status: 400 },
      );
    }
    console.error("[financial-years.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create financial year" },
      { status: 500 },
    );
  }
}
