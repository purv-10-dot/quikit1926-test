/**
 * Vendor Payment service — holds the logic the API route used to inline.
 *
 * The route handler is now pure transport: auth → validate → call service →
 * envelope. All reads, filters, and writes live here. Swap the in-memory
 * array for Prisma later without touching the route.
 */

import type { TenantContext } from "@/lib/auth/context";
import { DomainError } from "@/lib/http/errors";

export interface VendorPayment {
  id: string;
  paymentNo: string;
  vendor: string;
  poRef: string;
  invoiceNo: string;
  invoiceAmount: number;
  tdsSection: string;
  tdsRate: number;
  tdsDeducted: number;
  netPayable: number;
  paymentDate: string;
  paymentMode: string;
  bank: string;
  status: string;
  utrNo: string;
}

export interface ListVendorPaymentsQuery {
  search?: string;
}

export interface CreateVendorPaymentInput {
  vendor: string;
  poRef: string;
  invoiceNo: string;
  invoiceAmount: number;
  tdsSection: string;
  tdsRate: number;
  paymentMode?: string;
  bank?: string;
}

const store: VendorPayment[] = [];

export async function listVendorPayments(
  _ctx: TenantContext,
  query: ListVendorPaymentsQuery,
): Promise<VendorPayment[]> {
  const search = query.search?.toLowerCase();
  if (!search) return store;
  return store.filter((r) =>
    [r.paymentNo, r.vendor, r.invoiceNo].some((v) => v.toLowerCase().includes(search)),
  );
}

export async function createVendorPayment(
  ctx: TenantContext,
  input: CreateVendorPaymentInput,
): Promise<VendorPayment> {
  const invoiceAmount = Number(input.invoiceAmount);
  const tdsRate = Number(input.tdsRate);
  const tdsDeducted = Math.round((invoiceAmount * tdsRate) / 100);
  const netPayable = invoiceAmount - tdsDeducted;

  if (store.some((r) => r.invoiceNo === input.invoiceNo && r.vendor === input.vendor)) {
    throw new DomainError(
      "CONFLICT",
      `Payment already exists for invoice ${input.invoiceNo}`,
      409,
      { details: { invoiceNo: input.invoiceNo, vendor: input.vendor } },
    );
  }

  const seq = store.length + 1;
  const record: VendorPayment = {
    id: `vp-${seq}`,
    paymentNo: `VP-${new Date().getFullYear()}-${String(seq).padStart(3, "0")}`,
    vendor: input.vendor,
    poRef: input.poRef,
    invoiceNo: input.invoiceNo,
    invoiceAmount,
    tdsSection: input.tdsSection,
    tdsRate,
    tdsDeducted,
    netPayable,
    paymentDate: "",
    paymentMode: input.paymentMode ?? "",
    bank: input.bank ?? "",
    status: "Pending",
    utrNo: "",
  };
  store.push(record);
  void ctx;
  return record;
}
