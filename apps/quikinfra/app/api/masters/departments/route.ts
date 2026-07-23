import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listDepartments,
  countDepartments,
  createDepartment,
} from "@/lib/masters/departments-repository";
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
    (paging) => listDepartments({ ...baseOpts, ...paging, orderBy }),
    () => countDepartments(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.department", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for org.department`, 403);
  }

  const body = await req.json();
  if (!body?.code || !String(body.code).trim()) {
    return NextResponse.json({ error: "Department code is required" }, { status: 400 });
  }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Department name is required" }, { status: 400 });
  }

  try {
    const record = await createDepartment({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      code: body.code,
      name: body.name,
      costCenter: body.costCenter,
      headUserId: body.headUserId,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json(
        { error: "A department with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[departments.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create department") },
      { status: 500 },
    );
  }
}
