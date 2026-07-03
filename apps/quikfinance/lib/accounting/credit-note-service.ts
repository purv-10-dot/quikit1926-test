import { Prisma } from "@prisma/client";
import type { z } from "zod";
import type { creditNoteSchema, vendorCreditSchema } from "@/lib/validations/commercial.schema";
import { postCreditNote, postVendorCredit, resolveControlAccounts, reverseJournalFor, round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

type Tx = Prisma.TransactionClient;
type CreditNoteInput = z.infer<typeof creditNoteSchema>;
type VendorCreditInput = z.infer<typeof vendorCreditSchema>;

function isPostedStatus(status: string): boolean {
  return status !== "draft" && status !== "void";
}

/** Create/update a customer credit note (sales return) with line items and post the GL reversal. */
export async function saveCreditNote(tx: Tx, orgId: string, userId: string | null, input: CreditNoteInput, noteId?: string): Promise<{ id: string }> {
  const items = input.line_items ?? [];
  const adjustment = round2(input.adjustment ?? 0);

  // Server-authoritative totals (tax computed per line from the org's rates).
  let subtotal = round2(input.subtotal ?? 0);
  let discountTotal = 0;
  let taxTotal = round2(input.tax_total ?? 0);
  type Line = { item_id: string | null; account_id: string | null; description: string; quantity: number; rate: number; discount: number; tax_rate_id: string | null; tax_amount: number; line_total: number };
  let computed: Line[] = [];
  if (items.length) {
    const rateRows = await tx.$queryRaw<Array<{ id: string; rate: string }>>`SELECT id, rate FROM tax_rates WHERE org_id = ${orgId}::uuid`;
    const rateById = new Map(rateRows.map((r) => [r.id, Number(r.rate)]));
    subtotal = 0; discountTotal = 0; taxTotal = 0;
    computed = items.map((line) => {
      const gross = round2(line.quantity * line.rate);
      const discount = round2(line.discount ?? 0);
      const net = round2(gross - discount);
      const pct = line.tax_rate_id ? rateById.get(line.tax_rate_id) ?? 0 : 0;
      const tax = round2((net * pct) / 100);
      subtotal = round2(subtotal + gross); discountTotal = round2(discountTotal + discount); taxTotal = round2(taxTotal + tax);
      return { item_id: line.item_id ?? null, account_id: line.account_id ?? null, description: line.description, quantity: line.quantity, rate: line.rate, discount, tax_rate_id: line.tax_rate_id ?? null, tax_amount: tax, line_total: net };
    });
  }
  const netRevenue = round2(subtotal - discountTotal + adjustment);
  const total = round2(netRevenue + taxTotal);
  const dueDate = input.due_date ?? input.issue_date;
  const posted = isPostedStatus(input.status);

  let id = noteId ?? "";
  if (noteId) {
    await tx.$executeRaw`
      UPDATE credit_notes SET
        contact_id = ${input.contact_id}::uuid, invoice_id = ${input.invoice_id ?? null}::uuid, status = ${input.status},
        issue_date = ${input.issue_date}::date, due_date = ${dueDate}::date, currency = ${input.currency},
        reference_number = ${input.reference_number ?? null}, warehouse_id = ${input.warehouse_id ?? null}::uuid,
        ar_account_id = ${input.ar_account_id ?? null}::uuid, salesperson = ${input.salesperson ?? null}, subject = ${input.subject ?? null},
        place_of_supply = ${input.place_of_supply ?? null}, subtotal = ${subtotal}, discount_total = ${discountTotal},
        tax_total = ${taxTotal}, round_off = ${adjustment}, total = ${total}, terms = ${input.terms ?? null},
        notes = ${input.notes ?? null}, updated_at = now()
      WHERE id = ${noteId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM credit_note_lines WHERE credit_note_id = ${noteId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const number = input.credit_note_number && input.credit_note_number.length > 0 ? input.credit_note_number : await nextDocumentNumber(tx, orgId, "credit_note", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO credit_notes (org_id, contact_id, invoice_id, credit_note_number, status, issue_date, due_date, currency,
        reference_number, warehouse_id, ar_account_id, salesperson, subject, place_of_supply,
        subtotal, discount_total, tax_total, round_off, total, balance, terms, notes)
      VALUES (${orgId}::uuid, ${input.contact_id}::uuid, ${input.invoice_id ?? null}::uuid, ${number}, ${input.status}, ${input.issue_date}::date, ${dueDate}::date, ${input.currency},
        ${input.reference_number ?? null}, ${input.warehouse_id ?? null}::uuid, ${input.ar_account_id ?? null}::uuid, ${input.salesperson ?? null}, ${input.subject ?? null}, ${input.place_of_supply ?? null},
        ${subtotal}, ${discountTotal}, ${taxTotal}, ${adjustment}, ${total}, ${total}, ${input.terms ?? null}, ${input.notes ?? null})
      RETURNING id`;
    id = rows[0].id;
  }

  // Persist line items.
  let order = 0;
  for (const line of computed) {
    await tx.$executeRaw`
      INSERT INTO credit_note_lines (org_id, credit_note_id, item_id, account_id, description, quantity, rate, discount, tax_rate_id, tax_amount, line_total, display_order)
      VALUES (${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.account_id ? line.account_id : null}::uuid, ${line.description},
        ${round2(line.quantity)}, ${round2(line.rate)}, ${line.discount}, ${line.tax_rate_id ? line.tax_rate_id : null}::uuid, ${line.tax_amount}, ${line.line_total}, ${order})`;
    order += 1;
  }

  let journalEntryId: string | null = null;
  if (posted) {
    const accounts = await resolveControlAccounts(tx, orgId);
    if (input.ar_account_id) accounts.receivable = input.ar_account_id;
    const row = await tx.$queryRaw<Array<{ credit_note_number: string }>>`SELECT credit_note_number FROM credit_notes WHERE id = ${id}::uuid`;
    // Pass net revenue as "subtotal" so the entry balances: Dr Revenue(net) + Dr Tax = Cr A/R(total).
    journalEntryId = await postCreditNote(tx, orgId, userId, { id, issue_date: input.issue_date, credit_note_number: row[0]?.credit_note_number ?? "", subtotal: netRevenue, tax_total: taxTotal, total, place_of_supply: input.place_of_supply ?? null }, accounts);
  } else {
    await reverseJournalFor(tx, orgId, "credit_note", id);
  }
  await tx.$executeRaw`UPDATE credit_notes SET journal_entry_id = ${journalEntryId ? journalEntryId : null}::uuid WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;

  return { id };
}

/** Create/update a vendor credit (purchase return / supplier debit note) with line items and post the GL reversal. */
export async function saveVendorCredit(tx: Tx, orgId: string, userId: string | null, input: VendorCreditInput, noteId?: string): Promise<{ id: string }> {
  const items = input.line_items ?? [];
  const adjustment = round2(input.adjustment ?? 0);

  // Server-authoritative totals: tax is computed per line from the org's rates
  // when line items are supplied; otherwise fall back to the posted header values
  // (e.g. a vendor credit created straight from a bill total).
  let subtotal = round2(input.subtotal ?? 0);
  let discountTotal = 0;
  let taxTotal = round2(input.tax_total ?? 0);
  type Line = { item_id: string | null; account_id: string | null; description: string; quantity: number; rate: number; discount: number; tax_rate_id: string | null; tax_amount: number; line_total: number };
  let computed: Line[] = [];
  if (items.length) {
    const rateRows = await tx.$queryRaw<Array<{ id: string; rate: string }>>`SELECT id, rate FROM tax_rates WHERE org_id = ${orgId}::uuid`;
    const rateById = new Map(rateRows.map((r) => [r.id, Number(r.rate)]));
    subtotal = 0; discountTotal = 0; taxTotal = 0;
    computed = items.map((line) => {
      const gross = round2(line.quantity * line.rate);
      const discount = round2(line.discount ?? 0);
      const net = round2(gross - discount);
      const pct = line.tax_rate_id ? rateById.get(line.tax_rate_id) ?? 0 : 0;
      const tax = round2((net * pct) / 100);
      subtotal = round2(subtotal + gross); discountTotal = round2(discountTotal + discount); taxTotal = round2(taxTotal + tax);
      return { item_id: line.item_id ?? null, account_id: line.account_id ?? null, description: line.description, quantity: line.quantity, rate: line.rate, discount, tax_rate_id: line.tax_rate_id ?? null, tax_amount: tax, line_total: net };
    });
  }
  const net = round2(subtotal - discountTotal + adjustment);
  const total = items.length ? round2(net + taxTotal) : round2(input.total);
  const dueDate = input.due_date ?? input.issue_date;
  const posted = isPostedStatus(input.status);

  let id = noteId ?? "";
  if (noteId) {
    await tx.$executeRaw`
      UPDATE vendor_credits SET
        contact_id = ${input.contact_id}::uuid, bill_id = ${input.bill_id ?? null}::uuid, status = ${input.status},
        issue_date = ${input.issue_date}::date, due_date = ${dueDate}::date, currency = ${input.currency},
        reference_number = ${input.reference_number ?? null}, order_number = ${input.order_number ?? null},
        warehouse_id = ${input.warehouse_id ?? null}::uuid, ap_account_id = ${input.ap_account_id ?? null}::uuid,
        subject = ${input.subject ?? null}, place_of_supply = ${input.place_of_supply ?? null},
        subtotal = ${subtotal}, discount_total = ${discountTotal}, tax_total = ${taxTotal}, total = ${total},
        terms = ${input.terms ?? null}, notes = ${input.notes ?? null}, updated_at = now()
      WHERE id = ${noteId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM vendor_credit_lines WHERE vendor_credit_id = ${noteId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const number = input.vendor_credit_number && input.vendor_credit_number.length > 0 ? input.vendor_credit_number : await nextDocumentNumber(tx, orgId, "vendor_credit", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO vendor_credits (org_id, contact_id, bill_id, vendor_credit_number, status, issue_date, due_date, currency,
        reference_number, order_number, warehouse_id, ap_account_id, subject, place_of_supply,
        subtotal, discount_total, tax_total, total, balance, terms, notes)
      VALUES (${orgId}::uuid, ${input.contact_id}::uuid, ${input.bill_id ?? null}::uuid, ${number}, ${input.status}, ${input.issue_date}::date, ${dueDate}::date, ${input.currency},
        ${input.reference_number ?? null}, ${input.order_number ?? null}, ${input.warehouse_id ?? null}::uuid, ${input.ap_account_id ?? null}::uuid, ${input.subject ?? null}, ${input.place_of_supply ?? null},
        ${subtotal}, ${discountTotal}, ${taxTotal}, ${total}, ${total}, ${input.terms ?? null}, ${input.notes ?? null})
      RETURNING id`;
    id = rows[0].id;
  }

  // Persist line items.
  let order = 0;
  for (const line of computed) {
    await tx.$executeRaw`
      INSERT INTO vendor_credit_lines (org_id, vendor_credit_id, item_id, account_id, description, quantity, rate, discount, tax_rate_id, tax_amount, line_total, display_order)
      VALUES (${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.account_id ? line.account_id : null}::uuid, ${line.description},
        ${round2(line.quantity)}, ${round2(line.rate)}, ${line.discount}, ${line.tax_rate_id ? line.tax_rate_id : null}::uuid, ${line.tax_amount}, ${line.line_total}, ${order})`;
    order += 1;
  }

  let journalEntryId: string | null = null;
  if (posted) {
    const accounts = await resolveControlAccounts(tx, orgId);
    if (input.ap_account_id) accounts.payable = input.ap_account_id;
    const row = await tx.$queryRaw<Array<{ vendor_credit_number: string }>>`SELECT vendor_credit_number FROM vendor_credits WHERE id = ${id}::uuid`;
    // Credit each line's expense account (falling back to the default expense account) for its net amount,
    // plus the adjustment so the entry balances against Dr A/P (net + adjustment + tax).
    const expenseCredits = computed.length
      ? [
          ...computed.map((l) => ({ account_id: l.account_id ?? accounts.defaultExpense ?? "", amount: l.line_total })),
          ...(adjustment !== 0 && accounts.defaultExpense ? [{ account_id: accounts.defaultExpense, amount: adjustment }] : [])
        ]
      : [];
    journalEntryId = await postVendorCredit(tx, orgId, userId, { id, issue_date: input.issue_date, vendor_credit_number: row[0]?.vendor_credit_number ?? "", tax_total: taxTotal, total, place_of_supply: input.place_of_supply ?? null }, expenseCredits, accounts);
  } else {
    await reverseJournalFor(tx, orgId, "vendor_credit", id);
  }
  await tx.$executeRaw`UPDATE vendor_credits SET journal_entry_id = ${journalEntryId ? journalEntryId : null}::uuid WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;

  return { id };
}
