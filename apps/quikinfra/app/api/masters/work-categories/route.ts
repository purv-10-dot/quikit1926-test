import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listWorkCategories,
  countWorkCategories,
  createWorkCategory,
} from "@/lib/masters/work-categories-repository";
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
    (paging) => listWorkCategories({ ...baseOpts, ...paging }),
    () => countWorkCategories(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
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
      sacCode: body.sacCode,
      sortOrder: body.sortOrder,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    console.error("[work-categories.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create work category" },
      { status: 500 },
    );
  }
}
