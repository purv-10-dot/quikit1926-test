import { Prisma } from "@prisma/client";
import type { BillInput } from "@/lib/validations/bill.schema";
import { postBill, resolveControlAccounts, reverseJournalFor, round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { loadItems, recordPurchase, reverseInventoryFor } from "@/lib/accounting/inventory";

type Tx = Prisma.TransactionClient;

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

const POSTED_STATUSES = new Set(["open", "submitted", "approved", "partial", "paid"]);

async function computeTotals(tx: Tx, orgId: string, input: BillInput) {
  const items = input.line_items ?? [];
  if (items.length === 0) {
    return {
      subtotal: round2(input.subtotal ?? 0),
      discount_total: round2(input.discount_total ?? 0),
      tax_total: round2(input.tax_total ?? 0),
      total: round2(input.total ?? 0),
      lines: [] as ComputedLine[]
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
    const percent = item.tax_rate_id ? rateById.get(item.tax_rate_id) ?? 0 : 0;
    const taxAmount = round2((net * percent) / 100);
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

  const total = round2(subtotal - discountTotal + taxTotal);
  return { subtotal, discount_total: discountTotal, tax_total: taxTotal, total, lines };
}

async function allocatedAmount(tx: Tx, orgId: string, billId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ allocated: string | null }>>`
    SELECT COALESCE(SUM(amount), 0) AS allocated
    FROM payment_allocations WHERE org_id = ${orgId}::uuid AND bill_id = ${billId}::uuid`;
  return round2(Number(rows[0]?.allocated ?? 0));
}

/** Create/update a vendor bill with line items, totals, balance_due, and GL posting. */
export async function saveBill(tx: Tx, orgId: string, userId: string | null, input: BillInput, billId?: string): Promise<{ id: string }> {
  const totals = await computeTotals(tx, orgId, input);
  const isPosted = POSTED_STATUSES.has(input.status);

  let id = billId ?? "";
  if (billId) {
    await tx.$executeRaw`
      UPDATE bills SET
        contact_id = ${input.contact_id}::uuid,
        status = ${input.status},
        issue_date = ${input.issue_date}::date,
        due_date = ${input.due_date}::date,
        currency = ${input.currency},
        exchange_rate = ${input.exchange_rate},
        subtotal = ${totals.subtotal},
        discount_total = ${totals.discount_total},
        tax_total = ${totals.tax_total},
        tds_amount = ${round2(input.tds_amount ?? 0)},
        total = ${totals.total},
        vendor_reference = ${input.vendor_reference ?? null},
        order_number = ${input.order_number ?? null},
        warehouse_id = ${input.warehouse_id ?? null}::uuid,
        payment_terms = ${input.payment_terms ?? null},
        ap_account_id = ${input.ap_account_id ?? null}::uuid,
        subject = ${input.subject ?? null},
        place_of_supply = ${input.place_of_supply ?? null},
        notes = ${input.notes ?? null},
        updated_at = now()
      WHERE id = ${billId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM bill_lines WHERE bill_id = ${billId}::uuid AND org_id = ${orgId}::uuid`;
  } else {
    const billNumber =
      input.bill_number && input.bill_number.length > 0
        ? input.bill_number
        : await nextDocumentNumber(tx, orgId, "bill", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO bills (
        org_id, contact_id, bill_number, status, issue_date, due_date, currency, exchange_rate,
        subtotal, discount_total, tax_total, tds_amount, total, balance_due, place_of_supply, notes,
        vendor_reference, order_number, warehouse_id, payment_terms, ap_account_id, subject
      ) VALUES (
        ${orgId}::uuid, ${input.contact_id}::uuid, ${billNumber}, ${input.status}, ${input.issue_date}::date, ${input.due_date}::date,
        ${input.currency}, ${input.exchange_rate}, ${totals.subtotal}, ${totals.discount_total}, ${totals.tax_total},
        ${round2(input.tds_amount ?? 0)}, ${totals.total}, ${totals.total}, ${input.place_of_supply ?? null}, ${input.notes ?? null},
        ${input.vendor_reference ?? null}, ${input.order_number ?? null}, ${input.warehouse_id ?? null}::uuid,
        ${input.payment_terms ?? null}, ${input.ap_account_id ?? null}::uuid, ${input.subject ?? null}
      ) RETURNING id`;
    id = rows[0].id;
  }

  let order = 0;
  for (const line of totals.lines) {
    await tx.$executeRaw`
      INSERT INTO bill_lines (org_id, bill_id, item_id, account_id, description, quantity, rate, discount, tax_rate_id, tax_amount, line_total, display_order)
      VALUES (
        ${orgId}::uuid, ${id}::uuid, ${line.item_id ? line.item_id : null}::uuid, ${line.account_id ? line.account_id : null}::uuid, ${line.description},
        ${line.quantity}, ${line.rate}, ${line.discount}, ${line.tax_rate_id ? line.tax_rate_id : null}::uuid,
        ${line.tax_amount}, ${line.line_total}, ${order}
      )`;
    order += 1;
  }

  // Attachments: keep the ones still referenced (by id), drop the rest, insert new uploads.
  const attachments = input.attachments ?? [];
  const existingAtt = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = 'bill' AND entity_id = ${id}::uuid`;
  const keep = new Set(attachments.filter((a) => a.id).map((a) => String(a.id)));
  for (const row of existingAtt) {
    if (!keep.has(String(row.id))) await tx.$executeRaw`DELETE FROM document_attachments WHERE id = ${row.id}::uuid`;
  }
  for (const a of attachments.filter((x) => !x.id && x.data)) {
    await tx.$executeRaw`
      INSERT INTO document_attachments (org_id, entity_type, entity_id, file_name, file_path, content_type, size_bytes, uploaded_by)
      VALUES (${orgId}::uuid, 'bill', ${id}::uuid, ${a.file_name}, ${a.data}, ${a.content_type ?? null}, ${Math.trunc(a.size_bytes ?? 0)}, ${userId ? userId : null}::uuid)`;
  }

  const tds = round2(input.tds_amount ?? 0);
  const allocated = billId ? await allocatedAmount(tx, orgId, id) : 0;
  // Vendor is paid net of TDS withheld.
  const balanceDue = round2(totals.total - tds - allocated);

  let journalEntryId: string | null = null;
  // Undo any prior stock effect before recomputing.
  await reverseInventoryFor(tx, orgId, "bill", id);

  if (isPosted) {
    const accounts = await resolveControlAccounts(tx, orgId);
    if (!accounts.defaultExpense) {
      throw new Error("Chart of accounts is missing a default expense account.");
    }
    // Per-bill Accounts Payable override (Zoho-style); falls back to the org default.
    if (input.ap_account_id) accounts.payable = input.ap_account_id;

    // Distribute the net debit: stock-tracked items hit Inventory Asset (and
    // update average cost + quantity); everything else hits an expense account.
    const items = await loadItems(tx, orgId, totals.lines.map((line) => line.item_id ?? "").filter(Boolean));
    const byAccount = new Map<string, number>();
    if (totals.lines.length > 0) {
      for (const line of totals.lines) {
        const item = line.item_id ? items.get(line.item_id) : undefined;
        if (item?.track_inventory) {
          const inventoryAccount = item.asset_account_id ?? accounts.inventoryAsset;
          if (!inventoryAccount) {
            throw new Error("Chart of accounts is missing an Inventory Asset account.");
          }
          // Stock layers store BASE-currency cost, so convert the foreign unit cost.
          const billRate = Number(input.exchange_rate ?? 1) || 1;
          const unitCost = line.quantity > 0 ? round2((line.line_total / line.quantity) * billRate) : 0;
          await recordPurchase(tx, orgId, item, line.quantity, unitCost, { type: "bill", id, date: input.issue_date });
          byAccount.set(inventoryAccount, round2((byAccount.get(inventoryAccount) ?? 0) + line.line_total));
        } else {
          const accountId = line.account_id ?? accounts.defaultExpense;
          byAccount.set(accountId, round2((byAccount.get(accountId) ?? 0) + line.line_total));
        }
      }
    } else {
      byAccount.set(accounts.defaultExpense, round2(totals.subtotal - totals.discount_total));
    }
    const expenseDebits = Array.from(byAccount.entries()).map(([account_id, amount]) => ({ account_id, amount }));

    const billRow = await tx.$queryRaw<Array<{ bill_number: string }>>`SELECT bill_number FROM bills WHERE id = ${id}::uuid`;
    journalEntryId = await postBill(
      tx,
      orgId,
      userId,
      { id, issue_date: input.issue_date, bill_number: billRow[0]?.bill_number ?? "", tax_total: totals.tax_total, total: totals.total, tds_amount: tds, place_of_supply: input.place_of_supply ?? null },
      expenseDebits,
      accounts,
      Number(input.exchange_rate ?? 1)
    );
  } else {
    await reverseJournalFor(tx, orgId, "bill", id);
  }

  await tx.$executeRaw`
    UPDATE bills SET balance_due = ${balanceDue}, journal_entry_id = ${journalEntryId ? journalEntryId : null}::uuid
    WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;

  return { id };
}
