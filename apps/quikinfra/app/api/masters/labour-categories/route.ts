import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import {
  listLabourCategories,
  countLabourCategories,
  createLabourCategory,
} from "@/lib/masters/labour-categories-repository";
import { parsePagination, paginateDb, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_labour", "view");
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
  const baseOpts = { orgId: ctx.orgId, createdBy: ctx.userId, search, status };

  const { orderBy } = parseSort(
    searchParams,
    ["code", "name", "skillLevel", "trade", "status", "createdAt"],
    { field: "code", order: "asc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listLabourCategories({ ...baseOpts, ...paging, orderBy }),
    () => countLabourCategories(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_labour", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  try {
    const record = await createLabourCategory({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      skillLevel: body.skillLevel,
      trade: body.trade,
      defaultUomId: body.defaultUomId,
      description: body.description,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    if (getErrorCode(e) === "P2002") {
      return envelopeErr("DUPLICATE", "A labour category with this code already exists", 409);
    }
    console.error("[labour-category.create] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to create labour category"), 500);
  }
}
