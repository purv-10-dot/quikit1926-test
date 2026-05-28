import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findTermsConditionById,
  updateTermsCondition,
  deleteTermsCondition,
} from "@/lib/masters/terms-repository";

/**
 * Per-row Terms & Conditions endpoints — Postgres-backed.
 *
 * GET    — fetch one, tenant-scoped.
 * PUT    — partial update (status flip handled here too).
 * PATCH  — alias of PUT.
 * DELETE — soft delete via `status = "inactive"` so PO/WO/RFQ FKs stay valid.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await findTermsConditionById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "T&C template not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "org.terms", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for org.terms`, 403);
  }

  const body = await req.json();

  // Strip audit/identity fields — the client can never overwrite these.
  const {
    id: _a, orgId: _c,
    createdAt: _d, createdBy: _e, updatedAt: _f, updatedBy: _g,
    ...safe
  } = body ?? {};

  try {
    const next = await updateTermsCondition(ctx.orgId, id, {
      title: safe.title,
      body: safe.body,
      applicableTo: safe.applicableTo,
      isDefault: safe.isDefault,
      status: safe.status,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "T&C template not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    console.error("[terms.update] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update T&C template" },
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
  if (!hasMatrixAction(ctx, "org.terms", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for org.terms`, 403);
  }
  const ok = await deleteTermsCondition(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "T&C template not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
