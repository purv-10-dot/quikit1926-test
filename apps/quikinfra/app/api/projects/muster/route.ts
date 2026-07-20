import { toErrorMessage } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { err as envelopeErr } from "@/lib/http/envelope";
import { DomainError } from "@/lib/http";
import { listMusters, countMusters, createMuster } from "@/lib/labour/muster-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const baseOpts = {
    orgId: ctx.orgId,
    projectId: searchParams.get("projectId") ?? undefined,
    contractorId: searchParams.get("contractorId") ?? undefined,
    engagementType: searchParams.get("engagementType") ?? undefined,
    docStatus: searchParams.get("docStatus") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
  };

  const { orderBy } = parseSort(
    searchParams,
    ["musterDate", "musterNo", "docStatus", "createdAt"],
    { field: "musterDate", order: "desc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listMusters({ ...baseOpts, ...paging, orderBy }),
    () => countMusters(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const body = await req.json();
  if (!body?.projectId) return envelopeErr("VALIDATION", "projectId is required", 400);
  try {
    const record = await createMuster({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      projectId: body.projectId,
      musterDate: body.musterDate,
      engagementType: body.engagementType,
      contractorId: body.contractorId ?? null,
      workOrderId: body.workOrderId ?? null,
      shift: body.shift,
      remarks: body.remarks ?? null,
      lines: body.lines ?? [],
    });
    return NextResponse.json(record, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof DomainError) return envelopeErr(e.code, e.message, e.httpStatus);
    console.error("[muster.create] failed:", e);
    return envelopeErr("INTERNAL_ERROR", toErrorMessage(e, "Failed to create muster"), 500);
  }
}
