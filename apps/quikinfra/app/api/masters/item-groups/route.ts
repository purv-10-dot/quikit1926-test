import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction, getTenantContext } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  listItemGroups,
  countItemGroups,
  createItemGroup,
} from "@/lib/masters/item-groups-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

export async function GET(req: NextRequest) {
  // Item groups are lookup/reference data picked across modules, so the LIST
  // is readable by ANY authenticated user in the org — no Masters permission
  // required. Still scoped to ctx.orgId below. Create/edit/delete still
  // require the full Masters permission.
  const ctx = await getTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
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
  const ctxOrResp = await requireMastersAction("construction.master_item_group", "create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
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
  } catch (err: unknown) {
    console.error("[item-groups.create] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to create item group") }, { status: 500 });
  }
}
