import { Prisma } from "@prisma/client";
import type { InvoiceInput } from "@/lib/validations/invoice.schema";
import { type JournalLine, postInvoice, resolveControlAccounts, reverseJournalFor, round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { loadItems, recordSale, reverseInventoryFor } from "@/lib/accounting/inventory";
import { loadCustomerVendorSettings } from "@/lib/settings/customer-vendor";

type Tx = Prisma.TransactionClient;

/**
 * Block (or allow with a warning) an invoice that would push a customer over
 * their credit limit, per Settings → Customers & Vendors. "restrict" throws;
 * "warn" lets it through (the limit is advisory).
 */
async function enforceCreditLimit(tx: Tx, orgId: string, contactId: string, invoiceAmount: number, invoiceId?: string): Promise<void> {
  const settings = await loadCustomerVendorSettings(tx, orgId);
  if (!settings.credit_limit_enabled || settings.credit_limit_action !== "restrict") return;

  const rows = await tx.$queryRaw<Array<{ credit_limit: string | null }>>`
    SELECT credit_limit FROM contacts WHERE id = ${contactId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
  const limit = rows[0]?.credit_limit != null ? Number(rows[0].credit_limit) : null;
  if (!limit || limit <= 0) return;

  const outRows = await tx.$queryRaw<Array<{ outstanding: string | null }>>`
    SELECT COALESCE(SUM(balance_due), 0) AS outstanding FROM invoices
    WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid
    ${invoiceId ? Prisma.sql`AND id <> ${invoiceId}::uuid` : Prisma.empty}`;
  let exposure = round2(Number(outRows[0]?.outstanding ?? 0) + invoiceAmount);

  if (settings.credit_limit_include_so) {
    const soRows = await tx.$queryRaw<Array<{ total: string | null }>>`
      SELECT COALESCE(SUM(total), 0) AS total FROM sales_orders
      WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid AND status <> 'closed'`;
    exposure = round2(exposure + Number(soRows[0]?.total ?? 0));
  }

  if (exposure > limit) {
    throw new Error(`Credit limit exceeded: this invoice would take the customer's exposure to ${exposure.toFixed(2)}, over their limit of ${limit.toFixed(2)}.`);
  }
}

type ComputedLine = {
  description: string;
  quantity: number;
  rate: number;
  discount: number;
  tax_rate_id: string | null;
  account_id: string | null;
  item_id: string | null;
  tax_amount: number;
  line_total: number;
};

type ComputedTotals = {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  lines: ComputedLine[];
};

const POSTED_STATUSES = new Set(["sent", "viewed", "partial", "paid", "overdue"]);

/** Server-authoritative totals: tax is computed per line from the org's tax rates. */
async function computeTotals(tx: Tx, orgId: string, input: InvoiceInput): Promise<ComputedTotals> {
  const items = input.line_items ?? [];

  // No line items → trust the header amounts (back-compat for header-only invoices).
  if (items.length === 0) {
    return {
      subtotal: round2(input.subtotal ?? 0),
      discount_total: round2(input.discount_total ?? 0),
      tax_total: round2(input.tax_total ?? 0),
      total: round2(input.total ?? 0),
      lines: []
    };
  }

  const rateRows = await tx.$queryRaw<Array<{ id: string; rate: string }>>`
    SELECT id, rate FROM tax_rates WHERE org_id = ${orgId}::uuid`;
  const rateById = new Map(rateRows.map((row) => [row.id, Number(row.rate)]));

  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  const lines: ComputedLine[] = items.map((item) => {
    const gross = round2(item.quantity * item.rate);
    const discount = round2(item.discount ?? 0);
    const net = round2(gross - discount);
    const taxPercent = item.tax_rate_id ? rateById.get(item.tax_rate_id) ?? 0 : 0;
    const taxAmount = round2((net * taxPercent) / 100);
    subtotal = round2(subtotal + gross);
    discountTotal = round2(discountTotal + discount);
    taxTotal = round2(taxTotal + taxAmount);
    return {
      description: item.description,
      quantity: item.quantity,
      rate: item.rate,
      discount,
      tax_rate_id: item.tax_rate_id ?? null,
      account_id: item.account_id ?? null,
      item_id: item.item_id ?? null,
      tax_amount: taxAmount,
      line_total: net
    };
  });

  const roundOff = round2(input.round_off ?? 0);
  const total = round2(subtotal - discountTotal + taxTotal + roundOff);
  return { subtotal, discount_total: discountTotal, tax_total: taxTotal, total, lines };
}

async function allocatedAmount(tx: Tx, orgId: string, invoiceId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ allocated: string | null }>>`
    SELECT COALESCE(SUM(amount), 0) AS allocated
    FROM payment_allocations WHERE org_id = ${orgId}::uuid AND invoice_id = ${invoiceId}::uuid`;
  return round2(Number(rows[0]?.allocated ?? 0));
}

/**
 * Create or update an invoice with its line items, recompute totals, set
 * balance_due, and post (or reverse) the general-ledger journal entry.
 * Runs inside the caller's transaction.
 */
export async function saveInvoice(
  tx: Tx,
  orgId: string,
  userId: string | null,
  input: InvoiceInput,
  invoiceId?: string
): Promise<{ id: string }> {
  const totals = await computeTotals(tx, orgId, input);
  const roundOff = round2(input.round_off ?? 0);
  const tcs = round2(input.tcs_amount ?? 0);
  const isPosted = POSTED_STATUSES.has(input.status);

  // Enforce the customer credit limit (Settings → Customers & Vendors).
  if (isPosted) {
    await enforceCreditLimit(tx, orgId, input.contact_id, round2(totals.total + tcs), invoiceId);
  }

  let id = invoiceId ?? "";
  if (invoiceId) {
    await tx.$executeRaw`
      UPDATE invoices SET
        contact_id = ${input.contact_id}::uuid,
        status = ${input.status},
        issue_date = ${input.issue_date}::date,
        due_date = ${input.due_date}::date,
        currency = ${input.currency},
        exchange_rate = ${input.exchange_rate},
        subtotal = ${totals.subtotal},
        discount_total = ${totals.discount_total},
        tax_total = ${totals.tax_total},
        round_off = ${roundOff},
        tcs_amount = ${tcs},
        total = ${totals.total},
        place_of_supply = ${input.place_of_supply ?? null},
        template_type = ${input.template_type},
        order_number = ${input.order_number ?? null},
        warehouse_id = ${input.warehouse_id ?? null}::uuid,
        ar_account_id = ${input.ar_account_id ?? null}::uuid,
        salesperson = ${input.salesperson ?? null},
        subject = ${input.subject ?? null},
        terms = ${input.terms ?? null},
        notes = ${input.notes ?? null},
        updated_at = now()
      WHERE id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM invoice_lines WHERE invoice_id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const invoiceNumber =
      input.invoice_number && input.invoice_number.length > 0
        ? input.invoice_number
        : await nextDocumentNumber(tx, orgId, "invoice", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO invoices (
        org_id, contact_id, invoice_number, status, issue_date, due_date, currency, exchange_rate,
        subtotal, discount_total, tax_total, round_off, tcs_amount, total, balance_due,
        place_of_supply, template_type, order_number, warehouse_id, ar_account_id, salesperson, subject, terms, notes, created_by
      ) VALUES (
        ${orgId}::uuid, ${input.contact_id}::uuid, ${invoiceNumber}, ${input.status}, ${input.issue_date}::date, ${input.due_date}::date,
        ${input.currency}, ${input.exchange_rate}, ${totals.subtotal}, ${totals.discount_total}, ${totals.tax_total}, ${roundOff},
        ${tcs}, ${totals.total}, ${round2(totals.total + tcs)}, ${input.place_of_supply ?? null}, ${input.template_type},
        ${input.order_number ?? null}, ${input.warehouse_id ?? null}::uuid, ${input.ar_account_id ?? null}::uuid, ${input.salesperson ?? null}, ${input.subject ?? null}, ${input.terms ?? null},
        ${input.notes ?? null}, ${userId ? userId : null}::uuid
      ) RETURNING id`;
    id = rows[0].id;
  }

  // Persist line items.
  let order = 0;
  for (const line of totals.lines) {
    await tx.$executeRaw`
      INSERT INTO invoice_lines (org_id, invoice_id, item_id, account_id, description, quantity, rate, discount, tax_rate_id, tax_amount, line_total, display_order)
      VALUES (
        ${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.account_id ? line.account_id : null}::uuid, ${line.description},
        ${line.quantity}, ${line.rate}, ${line.discount}, ${line.tax_rate_id ? line.tax_rate_id : null}::uuid,
        ${line.tax_amount}, ${line.line_total}, ${order}
      )`;
    order += 1;
  }

  // Balance due = total + TCS collected − already-allocated payments.
  const allocated = invoiceId ? await allocatedAmount(tx, orgId, id) : 0;
  const balanceDue = round2(totals.total + tcs - allocated);

  // Post / reverse the journal entry (plus inventory & COGS for stock items).
  let journalEntryId: string | null = null;
  // Undo any prior stock effect before recomputing.
  await reverseInventoryFor(tx, orgId, "invoice", id);

  if (isPosted) {
    const accounts = await resolveControlAccounts(tx, orgId);
    // Per-invoice Accounts Receivable override (defaults to the control AR).
    if (input.ar_account_id) accounts.receivable = input.ar_account_id;

    // Issue stock for tracked items and build the COGS journal pairs.
    const items = await loadItems(tx, orgId, totals.lines.map((line) => line.item_id ?? "").filter(Boolean));
    const cogsByAccount = new Map<string, number>();
    const inventoryByAccount = new Map<string, number>();
    for (const line of totals.lines) {
      if (!line.item_id) continue;
      const item = items.get(line.item_id);
      if (!item || !item.track_inventory) continue;
      const cogs = await recordSale(tx, orgId, item, line.quantity, { type: "invoice", id, date: input.issue_date });
      if (cogs <= 0) continue;
      const cogsAccount = item.expense_account_id ?? accounts.cogs;
      const inventoryAccount = item.asset_account_id ?? accounts.inventoryAsset;
      if (!cogsAccount || !inventoryAccount) {
        throw new Error("Chart of accounts is missing a COGS or Inventory Asset account.");
      }
      cogsByAccount.set(cogsAccount, round2((cogsByAccount.get(cogsAccount) ?? 0) + cogs));
      inventoryByAccount.set(inventoryAccount, round2((inventoryByAccount.get(inventoryAccount) ?? 0) + cogs));
    }
    const extraLines: JournalLine[] = [
      ...Array.from(cogsByAccount, ([account_id, amount]) => ({ account_id, debit: amount, credit: 0, description: "Cost of goods sold" })),
      ...Array.from(inventoryByAccount, ([account_id, amount]) => ({ account_id, debit: 0, credit: amount, description: "Inventory issued" }))
    ];
    // TCS collected from the customer: the customer owes an extra `tcs`, booked as a liability.
    if (tcs > 0 && accounts.tcsPayable) {
      extraLines.push({ account_id: accounts.receivable, debit: tcs, credit: 0, description: "TCS collected" });
      extraLines.push({ account_id: accounts.tcsPayable, debit: 0, credit: tcs, description: "TCS payable" });
    }

    const invoiceRow = await tx.$queryRaw<Array<{ invoice_number: string }>>`
      SELECT invoice_number FROM invoices WHERE id = ${id}::uuid`;
    journalEntryId = await postInvoice(
      tx,
      orgId,
      userId,
      {
        id,
        issue_date: input.issue_date,
        invoice_number: invoiceRow[0]?.invoice_number ?? "",
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        round_off: roundOff,
        total: totals.total,
        place_of_supply: input.place_of_supply ?? null
      },
      accounts,
      extraLines,
      Number(input.exchange_rate ?? 1)
    );
  } else {
    await reverseJournalFor(tx, orgId, "invoice", id);
  }

  await tx.$executeRaw`
    UPDATE invoices SET balance_due = ${balanceDue}, journal_entry_id = ${journalEntryId ? journalEntryId : null}::uuid
    WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;

  return { id };
}
