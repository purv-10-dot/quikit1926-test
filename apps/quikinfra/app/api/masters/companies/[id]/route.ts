import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { NextRequest, NextResponse } from "next/server";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findCompanyById,
  updateCompany,
  deleteCompany,
} from "@/lib/masters/companies-repository";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctxOrResp = await requireMastersAction("construction.org_company", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const row = await findCompanyById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctxOrResp = await requireMastersAction("construction.org_company", "edit");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.company", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for org.company`, 403);
  }

  const body = await req.json();
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateCompany(ctx.orgId, id, {
      ...safe,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    console.error("[companies.update] failed:", err);
    return NextResponse.json(
      { error: toErrorMessage(err, "Failed to update company") },
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
  const ctxOrResp = await requireMastersAction("construction.org_company", "delete");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "org.company", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for org.company`, 403);
  }
  const ok = await deleteCompany(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Company not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
