/**
 * GET  /api/finance/vendor-payments   — list (search by paymentNo / vendor / invoiceNo)
 * POST /api/finance/vendor-payments   — create a pending payment
 *
 * Reference implementation of the backend API standards in docs/API_STANDARDS.md.
 * Follow this shape for every new/refactored route: auth → validate → service → envelope.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/context";
import { ok, created } from "@/lib/http/envelope";
import { toHttpResponse, DomainError } from "@/lib/http/errors";
import {
  listVendorPayments,
  createVendorPayment,
  type ListVendorPaymentsQuery,
  type CreateVendorPaymentInput,
} from "@/lib/finance/vendor-payment-service";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requirePermission("finance.view");
    if (ctx instanceof NextResponse) return ctx;

    const query = parseListQuery(req);
    const data = await listVendorPayments(ctx, query);

    return ok({ data, total: data.length });
  } catch (err) {
    return toHttpResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requirePermission("finance.view");
    if (ctx instanceof NextResponse) return ctx;

    const input = await parseCreateBody(req);
    const record = await createVendorPayment(ctx, input);

    return created(record);
  } catch (err) {
    return toHttpResponse(err);
  }
}

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
