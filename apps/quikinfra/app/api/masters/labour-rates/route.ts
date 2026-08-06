import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import {
  listLabourRates,
  countLabourRates,
  createLabourRate,
} from "@/lib/masters/labour-rates-repository";
import { parsePagination, paginateDb, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_labour", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const statusParam = (searchParams.get("status") ?? "").toLowerCase();
  const status: "active" | "inactive" | "all" | undefined =
    statusParam === "active" ? "active"
    : statusParam === "inactive" ? "inactive"
    : statusParam === "all" ? "all"
    : undefined;
  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search: searchParams.get("search") ?? "",
    labourCategoryId: searchParams.get("labourCategoryId") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    approvalStatus: searchParams.get("approvalStatus") ?? undefined,
    status,
  };

  const { orderBy } = parseSort(
    searchParams,
    ["effectiveFrom", "rate", "rateType", "approvalStatus", "createdAt"],
    { field: "effectiveFrom", order: "desc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listLabourRates({ ...baseOpts, ...paging, orderBy }),
    () => countLabourRates(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_labour", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  try {
    const record = await createLabourRate({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      labourCategoryId: body.labourCategoryId,
      projectId: body.projectId ?? null,
      rateType: body.rateType,
      rate: body.rate,
      effectiveFrom: body.effectiveFrom,
      effectiveTo: body.effectiveTo ?? null,
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    if (getErrorCode(e) === "P2003") {
      return envelopeErr("VALIDATION", "Referenced category or project does not exist", 400);
    }
    console.error("[labour-rate.create] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to create labour rate"), 500);
  }
}
