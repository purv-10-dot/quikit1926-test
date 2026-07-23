import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listTDSCodes,
  countTDSCodes,
  createTDSCode,
} from "@/lib/masters/tds-codes-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const statusParam = (searchParams.get("status") ?? "").toLowerCase();
  const status: "active" | "inactive" | "all" | undefined =
    statusParam === "active" ? "active"
    : statusParam === "inactive" ? "inactive"
    : statusParam === "all" ? "all"
    : undefined;
  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search,
    status,
  };

  const { orderBy } = parseSort(
    searchParams,
    ["code", "name", "status", "createdAt"],
    { field: "createdAt", order: "desc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listTDSCodes({ ...baseOpts, ...paging, orderBy }),
    () => countTDSCodes(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
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
  } catch (err: unknown) {
    console.error("[tds.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create TDS code") },
      { status: 500 },
    );
  }
}
