import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listWorkCategories,
  countWorkCategories,
  createWorkCategory,
} from "@/lib/masters/work-categories-repository";
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
    (paging) => listWorkCategories({ ...baseOpts, ...paging }),
    () => countWorkCategories(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.work_category", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for org.work_category`, 403);
  }

  const body = await req.json();
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Category name is required" }, { status: 400 });
  }

  try {
    const record = await createWorkCategory({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      name: body.name,
      description: body.description,
      sortOrder: body.sortOrder,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    console.error("[work-categories.create] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to create work category") },
      { status: 500 },
    );
  }
}
