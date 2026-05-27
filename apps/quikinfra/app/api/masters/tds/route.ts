import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listTDSCodes,
  countTDSCodes,
  createTDSCode,
} from "@/lib/masters/tds-codes-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ data: [], total: 0 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = {
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
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.tds", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for org.tds`, 403);
  }

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
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      section: body.section,
      description: body.description,
      rate: body.rate,
      thresholdAmount: body.thresholdAmount,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    console.error("[tds.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create TDS code" },
      { status: 500 },
    );
  }
}
