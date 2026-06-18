import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listCostCenters,
  countCostCenters,
  createCostCenter,
} from "@/lib/masters/cost-centers-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const baseOpts = {
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
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.cost_center", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.cost_center`, 403);
  }

  const body = await req.json();
  if (!body?.code || !String(body.code).trim()) {
    return NextResponse.json({ error: "Cost center code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Cost center name is required" }, { status: 400 });
  }

  try {
    const record = await createCostCenter({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      projectId: body.projectId,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json({ error: "A cost center with this code already exists" }, { status: 409 });
    }
    console.error("[cost-centers.create] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to create cost center") }, { status: 500 });
  }
}
