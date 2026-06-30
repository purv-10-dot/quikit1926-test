import type { Prisma } from "@prisma/client";
import { nextSequence } from "@/lib/accounting/posting";

type Client = { $queryRaw: Prisma.TransactionClient["$queryRaw"]; $queryRawUnsafe: Prisma.TransactionClient["$queryRawUnsafe"] };

/** Canonical document modules that participate in transaction numbering. */
export const NUMBER_MODULES = {
  invoice: { label: "Invoice", table: "invoices", column: "invoice_number", fallback: "INV" },
  bill: { label: "Bill", table: "bills", column: "bill_number", fallback: "BILL" },
  purchase_order: { label: "Purchase Order", table: "purchase_orders", column: "purchase_order_number", fallback: "PO" },
  sales_order: { label: "Sales Order", table: "sales_orders", column: "sales_order_number", fallback: "SO" },
  quotation: { label: "Quote", table: "quotations", column: "quotation_number", fallback: "QT" },
  credit_note: { label: "Credit Note", table: "credit_notes", column: "credit_note_number", fallback: "CN" },
  vendor_credit: { label: "Vendor Credit", table: "vendor_credits", column: "vendor_credit_number", fallback: "VC" },
  journal: { label: "Journal", table: "journal_entries", column: "entry_number", fallback: "JE" },
  delivery_challan: { label: "Delivery Challan", table: "delivery_challans", column: "challan_number", fallback: "DC" },
  payment_made: { label: "Vendor Payment", table: "payments", column: "payment_number", fallback: "PM" },
  payment_received: { label: "Customer Payment", table: "payments", column: "payment_number", fallback: "PR" },
  goods_receipt: { label: "Goods Receipt", table: "goods_receipts", column: "grn_number", fallback: "GRN" }
} as const;

export type NumberModule = keyof typeof NUMBER_MODULES;
export const NUMBER_MODULE_KEYS = Object.keys(NUMBER_MODULES) as NumberModule[];

type SeriesModuleCfg = { prefix?: string; next_number?: number };

/**
 * Resolve the prefix + starting floor for a module from the transaction series.
 * Precedence: the location's default series → the org's default series → none.
 */
async function resolveSeries(client: Client, orgId: string, module: NumberModule, locationId?: string | null): Promise<{ prefix: string; floor: number } | null> {
  let config: Record<string, SeriesModuleCfg> | null = null;

  if (locationId) {
    const rows = (await client.$queryRaw`
      SELECT s.config FROM warehouses w JOIN transaction_series s ON s.id = w.default_series_id
      WHERE w.id = ${locationId}::uuid AND w.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<{ config: Record<string, SeriesModuleCfg> }>;
    config = rows[0]?.config ?? null;
  }
  if (!config) {
    const rows = (await client.$queryRaw`
      SELECT config FROM transaction_series WHERE org_id = ${orgId}::uuid AND is_default = true ORDER BY created_at ASC LIMIT 1
    `) as Array<{ config: Record<string, SeriesModuleCfg> }>;
    config = rows[0]?.config ?? null;
  }
  const m = config?.[module];
  if (!m || !m.prefix) return null;
  return { prefix: String(m.prefix), floor: Math.max(Number(m.next_number ?? 1) || 1, 1) };
}

/** Next number for a verbatim prefix (the prefix already includes any separator, Zoho-style). Collision-safe via max-suffix. */
export async function nextSeriesNumber(client: Client, orgId: string, table: string, column: string, prefix: string, floor = 1, pad = 5): Promise<string> {
  const rows = (await client.$queryRawUnsafe(
    `SELECT COALESCE(MAX(substring("${column}" from '([0-9]+)$')::bigint), 0) AS maxnum
     FROM "${table}" WHERE org_id = $1::uuid AND "${column}" LIKE $2`,
    orgId, `${prefix}%`
  )) as Array<{ maxnum: bigint | null }>;
  const next = Math.max(Number(rows[0]?.maxnum ?? 0) + 1, floor);
  return `${prefix}${String(next).padStart(pad, "0")}`;
}

/**
 * The next document number for a module, honouring the transaction series of the
 * given location (falling back to the org default series, then a fixed prefix).
 * This is what makes the series "used" on every create.
 */
export async function nextDocumentNumber(
  client: Client,
  orgId: string,
  module: NumberModule,
  opts: { locationId?: string | null; fallbackPrefix?: string; fallbackFloor?: number } = {}
): Promise<string> {
  const reg = NUMBER_MODULES[module];
  const series = await resolveSeries(client, orgId, module, opts.locationId ?? null);
  if (series) return nextSeriesNumber(client, orgId, reg.table, reg.column, series.prefix, series.floor);
  // No series configured for this module → legacy behaviour ("PREFIX-00001").
  return nextSequence(client as never, orgId, reg.table, reg.column, opts.fallbackPrefix ?? reg.fallback, opts.fallbackFloor ?? 1);
}

/** Non-consuming preview for a module + location (used by forms). */
export async function peekDocumentNumber(
  client: Client,
  orgId: string,
  module: NumberModule,
  opts: { locationId?: string | null; fallbackPrefix?: string; fallbackFloor?: number } = {}
): Promise<string> {
  // Same computation as next* — neither mutates state (numbering derives from MAX existing).
  return nextDocumentNumber(client, orgId, module, opts);
}
