import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listMachinery,
  countMachinery,
  createMachinery,
} from "@/lib/masters/machinery-repository";
import { parsePagination, paginateDb, parseSort } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_machinery", "view");
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
    ["code", "name", "type", "make", "registrationNo", "fuelType", "status", "createdAt"],
    { field: "createdAt", order: "desc" },
  );
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listMachinery({ ...baseOpts, ...paging, orderBy }),
    () => countMachinery(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("construction.master_machinery", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.machinery", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.machinery`, 403);
  }
  const body = await req.json();
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Machinery name is required" }, { status: 400 });
  }
  if (!body?.type || !String(body.type).trim()) {
    return NextResponse.json({ error: "Machinery type is required" }, { status: 400 });
  }
  try {
    const record = await createMachinery({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      type: body.type,
      make: body.make,
      model: body.model,
      registrationNo: body.registrationNo,
      projectId: body.projectId,
      locationId: body.locationId,
      fuelType: body.fuelType,
      capacity: body.capacity,
      meterType: body.meterType,
      currentMeter: body.currentMeter,
      fuelNorm: body.fuelNorm,
      serviceIntervalValue: body.serviceIntervalValue,
      serviceIntervalUnit: body.serviceIntervalUnit,
      ownershipType: body.ownershipType,
      capitalisationCost: body.capitalisationCost,
      deprMethod: body.deprMethod,
      deprRate: body.deprRate,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json({ error: "Machinery with this code already exists" }, { status: 409 });
    }
    console.error("[machinery.create] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to create machinery") }, { status: 500 });
  }
}
