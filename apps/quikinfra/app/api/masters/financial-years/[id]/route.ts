import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { getTenantContext } from "@/lib/auth/context";
import {
  findFinancialYearById,
  updateFinancialYear,
  deleteFinancialYear,
} from "@/lib/masters/financial-years-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findFinancialYearById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Financial year not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g, companyName: _h,
    ...safe
  } = body ?? {};

  try {
    const next = await updateFinancialYear(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Financial year not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A financial year with this label already exists" },
        { status: 409 },
      );
    }
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "The selected company does not exist" },
        { status: 400 },
      );
    }
    console.error("[financial-years.update] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update financial year" },
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
  const ctxOrResp = await requireMastersAction("delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  const ok = await deleteFinancialYear(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Financial year not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
