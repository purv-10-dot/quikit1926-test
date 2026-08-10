import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import { listUOMs, countUOMs, createUOM } from "@/lib/masters/uoms-repository";
import { parsePagination, paginateDb, parseSort, NEWEST_FIRST_TIEBREAK } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.org_uom", "view");
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
    { field: "code", order: "asc" },
    NEWEST_FIRST_TIEBREAK,
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listUOMs({ ...baseOpts, ...paging, orderBy }),
    () => countUOMs(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.org_uom", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.uom", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for org.uom`, 403);
  }

  const body = await req.json();
  if (!body?.code || !String(body.code).trim()) {
    return NextResponse.json({ error: "UOM code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "UOM name is required" }, { status: 400 });
  }

  try {
    const record = await createUOM({
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
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A UOM with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[uom.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create UOM") },
      { status: 500 },
    );
  }
}
