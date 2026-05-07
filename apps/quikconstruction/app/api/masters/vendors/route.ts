import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/auth/context";
import {
  validateMobile,
  normalizeMobile,
  validateEmail,
  normalizeEmail,
  validateGSTIN,
  validatePAN,
  validateRequired,
} from "@/lib/validators";
import {
  listVendors,
  countVendors,
  createVendor,
} from "@/lib/masters/vendors-repository";
import { parsePagination, paginateDb } from "@/lib/http/pagination";

/**
 * GET  /api/masters/vendors — list tenant vendors (seeded on first call).
 * POST /api/masters/vendors — create a vendor. Preserves the existing
 *                            input shape (mobile/phone alias, ifscCode
 *                            alias, etc.) so the Vendor master form
 *                            doesn't need to change.
 */

export async function GET(req: NextRequest) {
  try {  
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ data: [], total: 0 });
  
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") ?? "";
  
    const baseOpts = {
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      search,
    };
    const result = await paginateDb(
      parsePagination(req),
      (paging) => listVendors({ ...baseOpts, ...paging }),
      () => countVendors(baseOpts),
    );
    return NextResponse.json(result);

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[masters/vendors.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = await req.json();

  // Required fields
  const nameCheck = validateRequired(body.name, "Vendor Name");
  if (!nameCheck.valid) {
    return NextResponse.json({ error: nameCheck.error }, { status: 400 });
  }
  const addressCheck = validateRequired(body.address, "Address");
  if (!addressCheck.valid) {
    return NextResponse.json({ error: addressCheck.error }, { status: 400 });
  }

  // Validate/normalise the same inputs the legacy route validated —
  // keeps the form contract identical.
  const mobile = body.mobile ?? body.phone ?? "";
  if (mobile) {
    const mobileCheck = validateMobile(mobile);
    if (!mobileCheck.valid) {
      return NextResponse.json({ error: mobileCheck.error }, { status: 400 });
    }
  }
  const email = body.email ?? "";
  const emailRequired = validateRequired(email, "Email");
  if (!emailRequired.valid) {
    return NextResponse.json({ error: emailRequired.error }, { status: 400 });
  }
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.error }, { status: 400 });
  }
  const gstin = body.gstin ?? "";
  if (gstin) {
    const gstinCheck = validateGSTIN(gstin);
    if (!gstinCheck.valid) {
      return NextResponse.json({ error: gstinCheck.error }, { status: 400 });
    }
  }
  const pan = body.pan ?? "";
  if (pan) {
    const panCheck = validatePAN(pan);
    if (!panCheck.valid) {
      return NextResponse.json({ error: panCheck.error }, { status: 400 });
    }
  }

  try {
    const record = await createVendor({
      tenantId: ctx.tenantId,
      orgId: ctx.orgId,
      createdBy: ctx.userId,
      name: String(body.name).trim(),
      companyName: body.companyName ? String(body.companyName).trim() : undefined,
      vendorType: body.vendorType,
      category: body.category,
      contactPerson: body.contactPerson
        ? String(body.contactPerson).trim()
        : undefined,
      phone: mobile ? normalizeMobile(mobile) : undefined,
      email: email ? normalizeEmail(email) : undefined,
      gstin: gstin || undefined,
      gstType: body.gstType,
      pan: pan || undefined,
      msmeStatus: body.msmeStatus,
      msmeNumber: body.msmeNumber,
      address: body.address,
      city: body.city,
      state: body.state,
      pincode: body.pincode,
      bankName: body.bankName,
      bankAccountNo: body.accountNumber ?? body.bankAccountNo,
      bankIfsc: body.ifscCode ?? body.bankIfsc,
      paymentTerms: body.paymentTerms,
      paymentTermsDays: body.creditPeriod ?? body.paymentTermsDays,
      blacklistReason: body.blacklistReason,
      status: body.isBlacklisted ? "blacklisted" : (body.status ?? "active"),
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e?.code === "P2002") {
      return NextResponse.json(
        { error: `A vendor with this code already exists` },
        { status: 409 },
      );
    }
    console.error("[vendors.create] failed:", err);
    return NextResponse.json(
      { error: e?.message ?? "Failed to create vendor" },
      { status: 500 },
    );
  }
}
