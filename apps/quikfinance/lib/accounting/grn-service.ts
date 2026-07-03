import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createJournalEntry, resolveControlAccounts, reverseJournalFor, round2, type JournalLine } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { loadItems, recordPurchase, reverseInventoryFor } from "@/lib/accounting/inventory";

type Tx = Prisma.TransactionClient;

export const grnSchema = z.object({
  grn_number: z.string().trim().max(40).optional(),
  receipt_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  vendor_id: z.string().uuid(),
  purchase_order_id: z.string().uuid().optional().nullable(),
  warehouse_id: z.string().uuid().optional().nullable(),
  status: z.enum(["draft", "received", "billed", "cancelled"]).default("received"),
  notes: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        item_id: z.string().uuid(),
        qty_ordered: z.coerce.number().min(0).default(0),
        qty_received: z.coerce.number().positive(),
        unit_cost: z.coerce.number().min(0),
        notes: z.string().max(500).optional().nullable()
      })
    )
    .min(1)
});

export type GrnInput = z.infer<typeof grnSchema>;

const RECEIVED = new Set(["received", "billed"]);

/**
 * Create/update a goods receipt. When received, it adds FIFO stock and posts
 *   Dr Inventory Asset / Cr Goods-Received-Not-Invoiced (GRNI)
 * so stock is on the books before the vendor bill arrives.
 */
export async function saveGoodsReceipt(tx: Tx, orgId: string, userId: string | null, input: GrnInput, grnId?: string): Promise<{ id: string }> {
  const received = RECEIVED.has(input.status);

  let id = grnId ?? "";
  if (grnId) {
    await tx.$executeRaw`
      UPDATE goods_receipts SET
        vendor_id = ${input.vendor_id}::uuid, purchase_order_id = ${input.purchase_order_id ?? null}::uuid,
        warehouse_id = ${input.warehouse_id ?? null}::uuid, receipt_date = ${input.receipt_date}::date,
        status = ${input.status}, notes = ${input.notes ?? null}, updated_at = now()
      WHERE id = ${grnId}::uuid AND org_id = ${orgId}::uuid`;
    await tx.$executeRaw`DELETE FROM goods_receipt_lines WHERE grn_id = ${grnId}::uuid`;
  } else {
    const number = input.grn_number && input.grn_number.length > 0 ? input.grn_number : await nextDocumentNumber(tx, orgId, "goods_receipt", { locationId: input.warehouse_id ?? null });
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO goods_receipts (org_id, grn_number, receipt_date, purchase_order_id, vendor_id, warehouse_id, status, notes, created_by)
      VALUES (${orgId}::uuid, ${number}, ${input.receipt_date}::date, ${input.purchase_order_id ?? null}::uuid, ${input.vendor_id}::uuid,
        ${input.warehouse_id ?? null}::uuid, ${input.status}, ${input.notes ?? null}, ${userId ? userId : null}::uuid)
      RETURNING id`;
    id = rows[0].id;
  }

  for (const line of input.lines) {
    await tx.$executeRaw`
      INSERT INTO goods_receipt_lines (grn_id, item_id, qty_ordered, qty_received, unit_cost, total_cost, notes)
      VALUES (${id}::uuid, ${line.item_id}::uuid, ${round2(line.qty_ordered)}, ${round2(line.qty_received)}, ${round2(line.unit_cost)}, ${round2(line.qty_received * line.unit_cost)}, ${line.notes ?? null})`;
  }

  await reverseInventoryFor(tx, orgId, "goods_receipt", id);
  await reverseJournalFor(tx, orgId, "goods_receipt", id);

  if (received) {
    const accounts = await resolveControlAccounts(tx, orgId);
    if (!accounts.inventoryAsset || !accounts.grni) {
      throw new Error("Chart of accounts is missing an Inventory Asset or GRNI account.");
    }
    const items = await loadItems(tx, orgId, input.lines.map((line) => line.item_id));
    let goodsValue = 0;
    for (const line of input.lines) {
      const item = items.get(line.item_id);
      if (item?.track_inventory) {
        await recordPurchase(tx, orgId, item, line.qty_received, line.unit_cost, { type: "goods_receipt", id, date: input.receipt_date });
      }
      goodsValue = round2(goodsValue + line.qty_received * line.unit_cost);
    }
    if (goodsValue > 0) {
      const lines: JournalLine[] = [
        { account_id: accounts.inventoryAsset, debit: goodsValue, credit: 0, description: "Goods received" },
        { account_id: accounts.grni, debit: 0, credit: goodsValue, description: "Goods received not invoiced" }
      ];
      await createJournalEntry(tx, { orgId, entryDate: input.receipt_date, memo: "Goods receipt", sourceType: "goods_receipt", sourceId: id, createdBy: userId, lines });
    }
  }

  return { id };
}

/**
 * Convert a received GRN into a vendor bill. The bill clears GRNI rather than
 * re-debiting inventory (the stock is already on the books):
 *   Dr GRNI (+ Dr Input Tax) / Cr Accounts Payable
 */
export async function convertGrnToBill(tx: Tx, orgId: string, userId: string | null, grnId: string, taxTotal = 0): Promise<{ billId: string }> {
  const grnRows = await tx.$queryRaw<Array<{ vendor_id: string; bill_id: string | null; receipt_date: string }>>`
    SELECT vendor_id, bill_id, to_char(receipt_date,'YYYY-MM-DD') AS receipt_date FROM goods_receipts WHERE id = ${grnId}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
  if (!grnRows.length) throw new Error("Goods receipt was not found.");
  if (grnRows[0].bill_id) throw new Error("This goods receipt has already been billed.");

  const lines = await tx.$queryRaw<Array<{ item_id: string; qty_received: string; unit_cost: string; total_cost: string }>>`
    SELECT item_id, qty_received, unit_cost, total_cost FROM goods_receipt_lines WHERE grn_id = ${grnId}::uuid`;
  const subtotal = round2(lines.reduce((sum, line) => sum + Number(line.total_cost), 0));
  const tax = round2(taxTotal);
  const total = round2(subtotal + tax);

  const accounts = await resolveControlAccounts(tx, orgId);
  if (!accounts.payable || !accounts.grni) {
    throw new Error("Chart of accounts is missing Accounts Payable or GRNI.");
  }

  const billNumber = await nextDocumentNumber(tx, orgId, "bill", { locationId: null });
  const billRows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO bills (org_id, contact_id, bill_number, status, issue_date, due_date, currency, subtotal, tax_total, total, balance_due, notes)
    VALUES (${orgId}::uuid, ${grnRows[0].vendor_id}::uuid, ${billNumber}, 'approved', ${grnRows[0].receipt_date}::date, ${grnRows[0].receipt_date}::date,
      'INR', ${subtotal}, ${tax}, ${total}, ${total}, ${`From goods receipt`})
    RETURNING id`;
  const billId = billRows[0].id;

  let order = 0;
  for (const line of lines) {
    await tx.$executeRaw`
      INSERT INTO bill_lines (org_id, bill_id, item_id, description, quantity, rate, line_total, display_order)
      VALUES (${orgId}::uuid, ${billId}::uuid, ${line.item_id}::uuid, ${"Goods received"}, ${Number(line.qty_received)}, ${Number(line.unit_cost)}, ${Number(line.total_cost)}, ${order})`;
    order += 1;
  }

  // Clear GRNI and recognise the payable. Inventory is already on the books.
  const journalLines: JournalLine[] = [{ account_id: accounts.grni, debit: subtotal, credit: 0, description: `Bill ${billNumber}` }];
  if (tax > 0 && accounts.taxRecoverable) {
    journalLines.push({ account_id: accounts.taxRecoverable, debit: tax, credit: 0, description: `Input tax ${billNumber}` });
  }
  journalLines.push({ account_id: accounts.payable, debit: 0, credit: total, description: `Bill ${billNumber}` });
  await createJournalEntry(tx, { orgId, entryDate: grnRows[0].receipt_date, memo: `Bill ${billNumber} (from GRN)`, sourceType: "bill", sourceId: billId, createdBy: userId, lines: journalLines });

  await tx.$executeRaw`UPDATE bills SET journal_entry_id = (SELECT id FROM journal_entries WHERE source_type='bill' AND source_id=${billId}::uuid LIMIT 1) WHERE id = ${billId}::uuid`;
  await tx.$executeRaw`UPDATE goods_receipts SET bill_id = ${billId}::uuid, status = 'billed', updated_at = now() WHERE id = ${grnId}::uuid AND org_id = ${orgId}::uuid`;

  return { billId };
}
