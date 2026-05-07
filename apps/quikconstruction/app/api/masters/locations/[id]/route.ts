import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findLocationById,
  updateLocation,
  deleteLocation,
} from "@/lib/masters/locations-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const row = await findLocationById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = await req.json();
  const {
    id: _a, tenantId: _b, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g, projectName: _h,
    itemGroup: _i, itemGroupName: _j,
    ...safe
  } = body ?? {};
  try {
    const next = await updateLocation(ctx.tenantId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Location not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A location with this code already exists" }, { status: 409 });
    }
    console.error("[locations.update] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to update location" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const ok = await deleteLocation(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Location not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
