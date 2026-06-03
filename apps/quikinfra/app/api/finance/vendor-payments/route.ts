/**
 * GET  /api/finance/vendor-payments — list (search by paymentNo / vendor / invoiceNo)
 * POST /api/finance/vendor-payments — create a pending payment
 *
 * v2 permission gate: `construction.finance` + `view` (both methods).
 * Finance is read-only authority today; only admin + ho_user roles get
 * the grant. The legacy `finance.view` key mapped to this same pair.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";
import { ok, created } from "@/lib/http/envelope";
import { toHttpResponse, DomainError } from "@/lib/http/errors";
import {
  listVendorPayments,
  createVendorPayment,
  type ListVendorPaymentsQuery,
  type CreateVendorPaymentInput,
} from "@/lib/finance/vendor-payment-service";

const auth = withOrgAuthForResource("construction.finance");

export const GET = auth.view(async (_authCtx, req: NextRequest) => {
  try {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const query = parseListQuery(req);
    const data = await listVendorPayments(ctx, query);

    return ok({ data, total: data.length });
  } catch (err) {
    return toHttpResponse(err);
  }
});

export const POST = auth.view(async (_authCtx, req: NextRequest) => {
  try {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const input = await parseCreateBody(req);
    const record = await createVendorPayment(ctx, input);

    return created(record);
  } catch (err) {
    return toHttpResponse(err);
  }
});

function parseListQuery(req: NextRequest): ListVendorPaymentsQuery {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  return { search: search || undefined };
}

async function parseCreateBody(req: NextRequest): Promise<CreateVendorPaymentInput> {
  const body = await req.json().catch(() => {
    throw new DomainError("VALIDATION_ERROR", "Request body must be valid JSON", 422);
  });

  const missing: string[] = [];
  for (const f of ["vendor", "poRef", "invoiceNo", "tdsSection"] as const) {
    if (!body?.[f] || typeof body[f] !== "string") missing.push(f);
  }
  if (missing.length) {
    throw new DomainError(
      "VALIDATION_ERROR",
      `Missing or invalid fields: ${missing.join(", ")}`,
      422,
      { details: { fields: missing } },
    );
  }

  const invoiceAmount = Number(body.invoiceAmount);
  const tdsRate = Number(body.tdsRate);
  if (!Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
    throw new DomainError("VALIDATION_ERROR", "invoiceAmount must be a positive number", 422);
  }
  if (!Number.isFinite(tdsRate) || tdsRate < 0 || tdsRate > 100) {
    throw new DomainError("VALIDATION_ERROR", "tdsRate must be between 0 and 100", 422);
  }

  return {
    vendor: body.vendor,
    poRef: body.poRef,
    invoiceNo: body.invoiceNo,
    invoiceAmount,
    tdsSection: body.tdsSection,
    tdsRate,
    paymentMode: typeof body.paymentMode === "string" ? body.paymentMode : undefined,
    bank: typeof body.bank === "string" ? body.bank : undefined,
  };
}
