import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  findVendorById,
  updateVendor,
  deleteVendor,
} from "@/lib/masters/vendors-repository";
import {
  validateMobile,
  normalizeMobile,
  validateEmail,
  normalizeEmail,
  validateGSTIN,
  validatePAN,
} from "@/lib/validators";

/**
 * Per-row Vendor endpoints — Postgres-backed.
 *
 * GET    — fetch one, tenant-scoped.
 * PUT    — full update (status flip handled here too).
 * PATCH  — alias of PUT.
 * DELETE — soft delete via `status = "inactive"` so PO/GRN FKs stay valid.
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const row = await findVendorById(ctx.tenantId, params.id);
  if (!row) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  return NextResponse.json(row);
}

async function handleUpdate(req: NextRequest, id: string) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();

  // Re-apply the same validations the legacy PUT used.
  const mobile = body.mobile ?? body.phone;
  if (mobile) {
    const r = validateMobile(mobile);
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
  // Address is mandatory — reject updates that blank it out. A missing
  // `address` key is a partial patch of other fields and is allowed.
  if (body.address !== undefined && !String(body.address ?? "").trim()) {
    return NextResponse.json(
      { error: "Address is required" },
      { status: 400 },
    );
  }

  // Strip audit/identity fields so the client can't overwrite them.
  const {
    id: _a, tenantId: _b, orgId: _c, createdAt: _d, createdBy: _e,
    updatedAt: _f, updatedBy: _g,
    // Aliases the legacy form sent — map to canonical names below.
    mobile: _h, accountNumber: _i, ifscCode: _j, creditPeriod: _k,
    isBlacklisted: _l,
    ...safe
  } = body ?? {};

  try {
    const next = await updateVendor(ctx.tenantId, id, {
      ...safe,
      phone: mobile ? normalizeMobile(mobile) : safe.phone,
      email: body.email ? normalizeEmail(body.email) : safe.email,
      bankAccountNo: body.accountNumber ?? safe.bankAccountNo,
      bankIfsc: body.ifscCode ?? safe.bankIfsc,
      paymentTermsDays: body.creditPeriod ?? safe.paymentTermsDays,
      status: body.isBlacklisted
        ? "blacklisted"
        : (safe.status ?? undefined),
      updatedBy: ctx.userId,
    });
    if (!next) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    return NextResponse.json(next);
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: "A vendor with this code already exists" },
        { status: 409 },
      );
    }
    console.error("[vendors.update] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to update vendor" },
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
  const ok = await deleteVendor(ctx.tenantId, params.id, ctx.userId);
  if (!ok) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
