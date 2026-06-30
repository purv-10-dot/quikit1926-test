import { Prisma, type PrismaClient } from "@prisma/client";
import type { InvoiceInput } from "@/lib/validations/invoice.schema";
import type { BillInput } from "@/lib/validations/bill.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { saveBill } from "@/lib/accounting/bill-service";
import { saveExpense, type ExpenseInput } from "@/lib/accounting/expense-service";

type Tx = Prisma.TransactionClient;

export type Frequency = "daily" | "weekly" | "biweekly" | "monthly" | "bimonthly" | "quarterly" | "semiannually" | "annually";

/** Advance an ISO date (YYYY-MM-DD) by one period. */
export function advanceDate(dateIso: string, frequency: Frequency): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  switch (frequency) {
    case "daily":
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case "weekly":
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case "biweekly":
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case "monthly":
      date.setUTCMonth(date.getUTCMonth() + 1);
      break;
    case "bimonthly":
      date.setUTCMonth(date.getUTCMonth() + 2);
      break;
    case "quarterly":
      date.setUTCMonth(date.getUTCMonth() + 3);
      break;
    case "semiannually":
      date.setUTCMonth(date.getUTCMonth() + 6);
      break;
    case "annually":
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      break;
  }
  return date.toISOString().slice(0, 10);
}

function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type LineRow = {
  description: string;
  quantity: string | number;
  rate: string | number;
  discount: string | number;
  tax_rate_id: string | null;
  account_id: string | null;
  item_id: string | null;
};

function mapLines(rows: LineRow[]) {
  return rows.map((row) => ({
    description: String(row.description),
    quantity: Number(row.quantity),
    rate: Number(row.rate),
    discount: Number(row.discount ?? 0),
    tax_rate_id: row.tax_rate_id ?? null,
    account_id: row.account_id ?? null,
    item_id: row.item_id ?? null
  }));
}

/** Clone a template invoice into a new posted invoice dated `runDate`. */
async function generateFromInvoice(tx: Tx, orgId: string, userId: string | null, sourceId: string, runDate: string): Promise<void> {
  const head = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT contact_id, currency, place_of_supply, terms, notes, to_char(issue_date,'YYYY-MM-DD') AS issue_date, to_char(due_date,'YYYY-MM-DD') AS due_date
    FROM invoices WHERE id = ${sourceId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
  if (!head.length) return;
  const source = head[0];
  const lines = (await tx.$queryRaw<LineRow[]>`
    SELECT description, quantity, rate, discount, tax_rate_id, account_id, item_id
    FROM invoice_lines WHERE invoice_id = ${sourceId}::uuid AND org_id = ${orgId}::uuid ORDER BY display_order ASC`) ?? [];
  if (lines.length === 0) return;

  const termDays = dayDiff(String(source.issue_date), String(source.due_date));
  const input = {
    contact_id: String(source.contact_id),
    issue_date: runDate,
    due_date: addDays(runDate, termDays),
    status: "sent",
    currency: String(source.currency ?? "INR"),
    exchange_rate: 1,
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    round_off: 0,
    total: 0,
    balance_due: 0,
    place_of_supply: (source.place_of_supply as string | null) ?? null,
    template_type: "classic",
    terms: (source.terms as string | null) ?? null,
    notes: (source.notes as string | null) ?? null,
    line_items: mapLines(lines)
  } as unknown as InvoiceInput;

  await saveInvoice(tx, orgId, userId, input);
}

/** Clone a template bill into a new posted bill dated `runDate`. */
async function generateFromBill(tx: Tx, orgId: string, userId: string | null, sourceId: string, runDate: string): Promise<void> {
  const head = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT contact_id, currency, place_of_supply, notes, to_char(issue_date,'YYYY-MM-DD') AS issue_date, to_char(due_date,'YYYY-MM-DD') AS due_date
    FROM bills WHERE id = ${sourceId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
  if (!head.length) return;
  const source = head[0];
  const lines = (await tx.$queryRaw<LineRow[]>`
    SELECT description, quantity, rate, discount, tax_rate_id, account_id, item_id
    FROM bill_lines WHERE bill_id = ${sourceId}::uuid AND org_id = ${orgId}::uuid ORDER BY display_order ASC`) ?? [];
  if (lines.length === 0) return;

  const termDays = dayDiff(String(source.issue_date), String(source.due_date));
  const input = {
    contact_id: String(source.contact_id),
    issue_date: runDate,
    due_date: addDays(runDate, termDays),
    status: "approved",
    currency: String(source.currency ?? "INR"),
    exchange_rate: 1,
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    tds_amount: 0,
    total: 0,
    balance_due: 0,
    place_of_supply: (source.place_of_supply as string | null) ?? null,
    notes: (source.notes as string | null) ?? null,
    line_items: mapLines(lines)
  } as unknown as BillInput;

  await saveBill(tx, orgId, userId, input);
}

/** Clone a template expense into a new posted expense dated `runDate`. */
async function generateFromExpense(tx: Tx, orgId: string, userId: string | null, sourceId: string, runDate: string): Promise<void> {
  const head = await tx.$queryRaw<Array<Record<string, unknown>>>`
    SELECT vendor_id, customer_id, account_id, project_id, warehouse_id, amount, tax_amount, currency, payment_account_id, reference, description, is_billable
    FROM expenses WHERE id = ${sourceId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
  if (!head.length) return;
  const s = head[0];
  const input = {
    expense_date: runDate,
    vendor_id: (s.vendor_id as string | null) ?? null,
    customer_id: (s.customer_id as string | null) ?? null,
    account_id: String(s.account_id),
    project_id: (s.project_id as string | null) ?? null,
    warehouse_id: (s.warehouse_id as string | null) ?? null,
    amount: Number(s.amount ?? 0),
    tax_amount: Number(s.tax_amount ?? 0),
    currency: String(s.currency ?? "INR"),
    payment_account_id: (s.payment_account_id as string | null) ?? null,
    reference: (s.reference as string | null) ?? null,
    receipt_url: null,
    is_billable: Boolean(s.is_billable),
    description: String(s.description ?? "Recurring expense"),
    status: "posted"
  } as unknown as ExpenseInput;
  await saveExpense(tx, orgId, userId, input);
}

type DueProfile = {
  id: string;
  source_type: string;
  source_id: string;
  frequency: Frequency;
  occurrence_count: number | null;
  next_run_date: string;
  end_date: string | null;
};

/**
 * Generate documents for every recurring profile whose next run date is due.
 * Each profile is processed in its own transaction; the schedule then advances.
 */
export async function processDueRecurring(prisma: PrismaClient, orgId: string, userId: string | null, today: string): Promise<number> {
  const due = (await prisma.$queryRaw<DueProfile[]>`
    SELECT id, source_type, source_id, frequency, occurrence_count,
           to_char(next_run_date,'YYYY-MM-DD') AS next_run_date,
           to_char(end_date,'YYYY-MM-DD') AS end_date
    FROM recurring_transactions
    WHERE org_id = ${orgId}::uuid AND is_active = true AND next_run_date <= ${today}::date
    ORDER BY next_run_date ASC`) ?? [];

  let generated = 0;
  for (const profile of due) {
    await prisma.$transaction(async (tx) => {
      if (profile.source_type === "invoice") {
        await generateFromInvoice(tx, orgId, userId, profile.source_id, profile.next_run_date);
      } else if (profile.source_type === "bill") {
        await generateFromBill(tx, orgId, userId, profile.source_id, profile.next_run_date);
      } else if (profile.source_type === "expense") {
        await generateFromExpense(tx, orgId, userId, profile.source_id, profile.next_run_date);
      } else {
        return;
      }

      const next = advanceDate(profile.next_run_date, profile.frequency);
      const remaining = profile.occurrence_count != null ? profile.occurrence_count - 1 : null;
      const ended = Boolean((profile.end_date && next > profile.end_date) || (remaining != null && remaining <= 0));
      await tx.$executeRaw`
        UPDATE recurring_transactions
        SET next_run_date = ${next}::date, occurrence_count = ${remaining}, is_active = ${!ended}, updated_at = now()
        WHERE id = ${profile.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    generated += 1;
  }

  return generated;
}
