import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findMachineryById,
  updateMachinery,
  deleteMachinery,
} from "@/lib/masters/machinery-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const row = await findMachineryById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Machinery not found" }, { status: 404 });
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
    const next = await updateMachinery(ctx.tenantId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Machinery not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Machinery with this code already exists" }, { status: 409 });
    }
    console.error("[machinery.update] failed:", err);
    return NextResponse.json({ error: e?.message ?? "Failed to update machinery" }, { status: 500 });
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
  const ok = await deleteMachinery(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Machinery not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
