import { NextRequest, NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/context";
import { ok, err } from "@/lib/http/envelope";
import { VENDOR_PICKER_PERMISSIONS } from "@/lib/integrations/whitebooks-gst";
import { db } from "@/lib/db";
import { lookupGstStatusOnWhitebooks, isWhitebooksGstVerifyEnabled } from "@/lib/integrations/whitebooks-gst";

export async function POST(req: NextRequest) {
  // When the Whitebooks GST integration isn't configured, vendor verify is
  // a no-op. Short-circuit BEFORE the permission gate so the RFQ/PO vendor
  // picker keeps working for every role that can open those drawers — there
  // is nothing sensitive to gate when the feature is off.
  if (!isWhitebooksGstVerifyEnabled()) {
    return ok({
      skipped: true as const,
      reason: "not_configured" as const,
      active: true,
    });
  }

  const ctxOrResponse = await requireAnyPermission(VENDOR_PICKER_PERMISSIONS);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;

  const ctx = ctxOrResponse;
  let body: { vendorId?: string };
  try {
    body = await req.json();
  } catch {
    return err("BAD_REQUEST", "Invalid JSON body", 400);
  }

  const vendorId = String(body.vendorId ?? "").trim();
  if (!vendorId) {
    return err("BAD_REQUEST", "vendorId is required", 400);
  }

  let vendor: { id: string; gstin: string | null } | null = null;
  try {
    vendor = await (db as any).cnVendor.findFirst({
      where: { id: vendorId, orgId: ctx.orgId },
      select: { id: true, gstin: true },
    });
  } catch {
    return err("SERVER_ERROR", "Vendor lookup failed", 500);
  }

  if (!vendor) {
    return err("NOT_FOUND", "Vendor not found", 404);
  }

  const r = await lookupGstStatusOnWhitebooks(vendor.gstin);
  if (!r.ok) {
    return err("WHITEBOOKS_ERROR", r.message, 502);
  }
  if (r.skipped) {
    return ok({ skipped: true as const, active: true });
  }
  if (r.active) {
    return ok({
      skipped: false as const,
      active: true,
      statusLabel: r.statusLabel,
    });
  }
  return ok({
    skipped: false as const,
    active: false,
    statusLabel: r.statusLabel,
    message: r.message,
  });
}
