import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { resolveControlAccounts, createJournalEntry, round2 } from "@/lib/accounting/posting";
import { assertPeriodUnlocked } from "@/lib/period-locks";

export const dynamic = "force-dynamic";

type CartLine = { itemId: string; name: string; price: number; qty: number };
const METHODS = new Set(["cash", "card", "ewallet"]);

/**
 * POS checkout. Posts the sale as an invoice (Dr AR, Cr Revenue — and COGS/stock
 * for tracked items, via the shared invoice service) and a cash-receipt journal
 * entry (Dr Cash/Bank by tender, Cr AR), then marks the invoice paid. One
 * transaction — fully balanced and reconcilable.
 * Body: { items:[{itemId,name,price,qty}], orderType, paymentMethod, note?, customerId? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  try {
    const body = (await request.json()) as { items?: CartLine[]; orderType?: string; paymentMethod?: string; note?: string; customerId?: string };
    const items = (body.items ?? []).filter((l) => l.qty > 0 && l.price >= 0);
    if (!items.length) return fail(422, { code: "EMPTY_CART", message: "Add at least one item." });
    const method = (body.paymentMethod ?? "cash").toLowerCase();
    if (!METHODS.has(method)) return fail(422, { code: "BAD_METHOD", message: "Invalid payment method." });

    const today = new Date().toISOString().slice(0, 10);
    const lock = await assertPeriodUnlocked(auth.context, today, "sales");
    if (lock) return lock;

    // Customer: explicit, else the org's walk-in customer.
    let customerId = body.customerId;
    if (!customerId) {
      const w = (await prisma.$queryRaw`SELECT id FROM contacts WHERE org_id = ${orgId}::uuid AND type = 'customer' AND display_name = 'Walk-in Customer' LIMIT 1`) as Array<{ id: string }>;
      customerId = w[0]?.id;
    }
    if (!customerId) return fail(422, { code: "NO_CUSTOMER", message: "No customer (and no walk-in customer found)." });

    const total = round2(items.reduce((s, l) => s + l.price * l.qty, 0));
    const invoiceInput = invoiceSchema.parse({
      contact_id: customerId,
      issue_date: today,
      due_date: today,
      status: "sent",
      currency: "INR",
      exchange_rate: 1,
      subtotal: total,
      total,
      balance_due: total,
      notes: `POS sale · ${(body.orderType ?? "pickup")} · ${method}${body.note ? ` · ${body.note}` : ""}`,
      line_items: items.map((l) => ({ description: l.name, quantity: l.qty, rate: round2(l.price), account_id: null }))
    });

    const result = await prisma.$transaction(async (tx) => {
      const { id } = await saveInvoice(tx, orgId, userId, invoiceInput);
      const numRows = (await tx.$queryRaw`SELECT invoice_number FROM invoices WHERE id = ${id}::uuid`) as Array<{ invoice_number: string }>;

      const accounts = await resolveControlAccounts(tx, orgId);
      const tenderAccount = method === "cash" ? accounts.cash : accounts.bank;
      if (!tenderAccount || !accounts.receivable) throw new Error("Chart of accounts missing a cash/bank or receivable account.");

      // Cash receipt: Dr tender, Cr receivable — clears the AR raised by the invoice.
      await createJournalEntry(tx, {
        orgId,
        entryDate: today,
        memo: `POS receipt ${numRows[0]?.invoice_number ?? ""} (${method})`,
        sourceType: "pos_payment",
        sourceId: id,
        createdBy: userId,
        lines: [
          { account_id: tenderAccount, debit: total, credit: 0, description: "POS tender" },
          { account_id: accounts.receivable, debit: 0, credit: total, description: "POS receivable settled" }
        ]
      });

      await tx.$executeRaw`UPDATE invoices SET status = 'paid', balance_due = 0, updated_at = now() WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid`;
      return { id, invoiceNumber: numRows[0]?.invoice_number ?? "" };
    });

    return ok({
      invoiceId: result.id,
      invoiceNumber: result.invoiceNumber,
      date: today,
      orderType: body.orderType ?? "pickup",
      paymentMethod: method,
      items,
      subtotal: total,
      tax: 0,
      total
    }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CHECKOUT_FAILED", message: errorMessage(error) });
  }
}
