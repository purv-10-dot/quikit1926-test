import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findCustomerById,
  updateCustomer,
  deleteCustomer,
} from "@/lib/masters/customers-repository";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const row = await findCustomerById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireMastersAction("edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.customer", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.customer`, 403);
  }
  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};
  try {
    const next = await updateCustomer(ctx.orgId, id, { ...safe, updatedBy: ctx.userId });
    if (!next) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "A customer with this code already exists" }, { status: 409 });
    }
    console.error("[customers.update] failed:", err);
    return NextResponse.json({ error: err?.message ?? "Failed to update customer" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleUpdate(req, params.id);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ctxOrResp = await requireMastersAction("delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.customer", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.customer`, 403);
  }
  const ok = await deleteCustomer(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
