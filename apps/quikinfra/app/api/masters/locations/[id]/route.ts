import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findLocationById,
  updateLocation,
  deleteLocation,
} from "@/lib/masters/locations-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("construction.master_location", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findLocationById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireMastersAction("construction.master_location", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.location", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.location`, 403);
  }
  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g, projectName: _h,
    itemGroup: _i, itemGroupName: _j,
    ...safe
  } = body ?? {};
  try {
    const next = await updateLocation(ctx.orgId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    if (getErrorCode(err) === "P2002") {
      return NextResponse.json({ error: "A location with this code already exists" }, { status: 409 });
    }
    console.error("[locations.update] failed:", err);
    return NextResponse.json({ error: toErrorMessage(err, "Failed to update location") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("construction.master_location", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.location", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.location`, 403);
  }
  const ok = await deleteLocation(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
