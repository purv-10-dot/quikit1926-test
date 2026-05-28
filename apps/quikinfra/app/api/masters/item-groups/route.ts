import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listItemGroups,
  countItemGroups,
  createItemGroup,
} from "@/lib/masters/item-groups-repository";
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
    (paging) => listItemGroups({ ...baseOpts, ...paging }),
    () => countItemGroups(baseOpts),
  );
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "master.item_group", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.item_group`, 403);
  }
  const body = await req.json();
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Group name is required" }, { status: 400 });
  }
  try {
    const record = await createItemGroup({
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      name: body.name,
      parentId: body.parentId,
      sortOrder: body.sortOrder,
      workCategoryId: body.workCategoryId,
      status: body.status ?? "active",
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    console.error("[item-groups.create] failed:", err);
    return NextResponse.json({ error: err?.message ?? "Failed to create item group" }, { status: 500 });
  }
}
