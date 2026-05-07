import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findBankById,
  updateBank,
  deleteBank,
} from "@/lib/masters/banks-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await findBankById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Bank not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  const {
    id: _a, tenantId: _b, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g, companyName: _h,
    ...safe
  } = body ?? {};

  try {
    const next = await updateBank(ctx.tenantId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Bank not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A bank account with these details already exists" },
        { status: 409 },
      );
    }
    if (e?.code === "P2003") {
      return NextResponse.json(
        { error: "The selected company does not exist" },
        { status: 400 },
      );
    }
    console.error("[banks.update] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to update bank" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const ok = await deleteBank(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Bank not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
