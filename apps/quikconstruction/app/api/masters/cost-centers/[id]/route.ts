import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findCostCenterById,
  updateCostCenter,
  deleteCostCenter,
} from "@/lib/masters/cost-centers-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const row = await findCostCenterById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Cost center not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const body = await req.json();
  const {
    id: _a, tenantId: _b, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};
  try {
    const next = await updateCostCenter(ctx.tenantId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Cost center not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "A cost center with this code already exists" }, { status: 409 });
    }
    console.error("[cost-centers.update] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to update cost center" }, { status: 500 });
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
  const ok = await deleteCostCenter(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Cost center not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
