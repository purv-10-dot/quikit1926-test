import { NextRequest, NextResponse } from "next/server";
import { hasMatrixAction } from "@/lib/auth/context";
import { err as envelopeErr } from "@/lib/http/envelope";
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
import { isWhitebooksGstVerifyEnabled } from "@/lib/integrations/whitebooks-gst";
import { cachedJson } from "@/lib/http/cache";
import { parsePagination, paginateDb } from "@/lib/http/pagination";
import { requireMastersAction } from "@/lib/auth/requireMastersAction";

/**
 * GET  /api/masters/vendors — list tenant vendors (seeded on first call).
 * POST /api/masters/vendors — create a vendor. Preserves the existing
 *                            input shape (mobile/phone alias, ifscCode
 *                            alias, etc.) so the Vendor master form
 *                            doesn't need to change.
 */

export async function GET(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";

  const baseOpts = {
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    search,
  };
  const result = await paginateDb(
    parsePagination(req),
    (paging) => listVendors({ ...baseOpts, ...paging }),
    () => countVendors(baseOpts),
  );
  return cachedJson(result, "short");
}

export async function POST(req: NextRequest) {
  const ctxOrResp = await requireMastersAction("create");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;
  if (!hasMatrixAction(ctx, "master.vendor", "add")) {
    return envelopeErr("FORBIDDEN", `Action "add" not allowed for master.vendor`, 403);
  }

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
  if (isWhitebooksGstVerifyEnabled()) {
    if (!String(gstin).trim()) {
      return NextResponse.json(
        {
          error:
            "GSTIN is required while Whitebooks verification is enabled (WHITEBOOKS_ACCOUNT_EMAIL). Add it here so PO vendor checks can run.",
        },
        { status: 400 },
      );
    }
  }
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
      blacklistedAt: body.isBlacklisted ? new Date() : undefined,
      blacklistedUntil: body.blacklistedUntil ?? undefined,
      status: body.isBlacklisted ? "blacklisted" : (body.status ?? "active"),
    });
    return NextResponse.json(record, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: `A vendor with this code already exists` },
        { status: 409 },
      );
    }
    console.error("[vendors.create] failed:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to create vendor" },
      { status: 500 },
    );
  }
}
