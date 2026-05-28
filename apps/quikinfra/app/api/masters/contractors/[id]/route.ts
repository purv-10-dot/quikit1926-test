import { NextRequest, NextResponse } from "next/server";
import { getTenantContext, hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
import {
  findContractorById,
  updateContractor,
  deleteContractor,
} from "@/lib/masters/contractors-repository";
import {
  validateMobile,
  normalizeMobile,
  validateEmail,
  normalizeEmail,
  validateGSTIN,
  validatePAN,
  validateIFSC,
} from "@/lib/validators";

/**
 * Per-row Contractor endpoints — Postgres-backed.
 *
 * GET    — fetch one, tenant-scoped.
 * PUT    — partial update (also used by the UI delete-as-deactivate flow).
 * PATCH  — alias of PUT.
 * DELETE — soft delete via `status = "inactive"` so WO / RAB FKs stay valid.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await findContractorById(ctx.orgId, params.id);
  if (!row) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!hasMatrixAction(ctx, "master.contractor", "edit")) {
    return envelopeErr("FORBIDDEN", `Action "edit" not allowed for master.contractor`, 403);
  }

  const body = await req.json();

  const phone = body.phone ?? body.mobile;
  if (phone !== undefined && phone !== "") {
    const r = validateMobile(phone);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.email) {
    const r = validateEmail(body.email);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.gstin) {
    const r = validateGSTIN(body.gstin);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.pan) {
    const r = validatePAN(body.pan);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (body.ifscCode) {
    const r = validateIFSC(body.ifscCode);
    if (!r.valid) return NextResponse.json({ error: r.error }, { status: 400 });
  }

  // Strip only identity/audit fields + the `mobile` alias. Bank fields
  // are now first-class columns on CnContractor and flow through.
  const {
    id: _a, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    mobile: _h,
    ...safe
  } = body ?? {};

  try {
    const next = await updateContractor(ctx.orgId, id, {
      ...safe,
      phone: phone !== undefined ? (phone ? normalizeMobile(phone) : null) : undefined,
      email: body.email !== undefined ? (body.email ? normalizeEmail(body.email) : null) : undefined,
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "A contractor with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[contractors.update] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update contractor" },
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
  if (!hasMatrixAction(ctx, "master.contractor", "delete")) {
    return envelopeErr("FORBIDDEN", `Action "delete" not allowed for master.contractor`, 403);
  }
  const ok = await deleteContractor(ctx.orgId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
