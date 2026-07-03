import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { moneySchema } from "@/lib/validations/common.schema";
import { createJournalEntry, resolveControlAccounts, reverseJournalFor, round2, type JournalLine, type ControlAccounts } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

export const dynamic = "force-dynamic";

const receivedPaymentSchema = z.object({
  contact_id: z.string().uuid(),
  payment_number: z.string().trim().max(40).optional(),
  warehouse_id: z.string().uuid().optional().nullable(),
  reference_number: z.string().trim().max(120).optional().nullable(),
  payment_date: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
  amount: moneySchema,
  bank_charges: moneySchema.default(0),
  tds_amount: moneySchema.default(0),
  method: z.string().trim().min(1).max(80).default("Bank Transfer"),
  reference: z.string().trim().max(120).optional().nullable(),
  currency: z.string().trim().length(3).default("INR"),
  // Conversion to the company's base currency, captured at payment time.
  exchange_rate: z.coerce.number().positive().default(1),
  // "bank" = cash receipt (unapplied becomes a customer advance);
  // "advance" = apply a previously-received advance to invoices (no new cash).
  source: z.enum(["bank", "advance"]).default("bank"),
  deposit_account_id: z.string().uuid().optional().nullable(),
  memo: z.string().max(1000).optional().nullable(),
  allocations: z.array(z.object({ invoice_id: z.string().uuid(), amount: moneySchema })).default([])
});

/**
 * Build the GL lines for a received payment, converting the customer-currency
 * amounts to the company's base currency. Accounts Receivable is cleared at each
 * invoice's BOOKING rate (so the original AR debit reverses exactly), while the
 * bank receives cash at the PAYMENT rate; the difference is realized exchange
 * gain/loss (account 6900). At exchange_rate = 1 (single-currency) the result is
 * identical to a plain payment — no FX line is produced.
 */
async function buildReceiptLines(
  tx: Prisma.TransactionClient,
  orgId: string,
  accounts: ControlAccounts,
  p: {
    isAdvanceApplication: boolean; amount: number; allocations: Array<{ invoice_id: string; amount: number }>;
    allocatedSum: number; bankCharges: number; tds: number; unapplied: number;
    depositAccountId: string | null; exchangeRate: number; reference: string | null;
  }
): Promise<JournalLine[]> {
  if (p.isAdvanceApplication) {
    if (!accounts.customerAdvances) throw new Error("Chart of accounts is missing a Customer Advances account.");
    return [
      { account_id: accounts.customerAdvances, debit: p.amount, credit: 0, description: "Advance applied" },
      { account_id: accounts.receivable, debit: 0, credit: p.amount, description: "Advance applied to invoices" }
    ];
  }

  const rate = p.exchangeRate || 1;
  // AR clears at each invoice's booking rate.
  let arCreditBase = 0;
  const positive = p.allocations.filter((a) => a.amount > 0);
  if (positive.length > 0) {
    const rateRows = (await tx.$queryRawUnsafe(
      `SELECT id, COALESCE(exchange_rate, 1) AS er FROM invoices WHERE org_id = $1::uuid AND id = ANY($2::uuid[])`,
      orgId, positive.map((a) => a.invoice_id)
    )) as Array<{ id: string; er: string }>;
    const erById = new Map(rateRows.map((r) => [r.id, Number(r.er) || 1]));
    for (const a of positive) arCreditBase += round2(a.amount * (erById.get(a.invoice_id) ?? 1));
    arCreditBase = round2(arCreditBase);
  }

  const depositToBank = round2((p.amount - p.bankCharges - p.tds) * rate);
  const chargesBase = round2(p.bankCharges * rate);
  const tdsBase = round2(p.tds * rate);
  const advancesBase = round2(p.unapplied * rate);

  const lines: JournalLine[] = [
    { account_id: p.depositAccountId as string, debit: depositToBank, credit: 0, description: `Payment ${p.reference ?? ""}`.trim() }
  ];
  if (chargesBase > 0) {
    if (!accounts.defaultExpense) throw new Error("Chart of accounts is missing an expense account for bank charges.");
    lines.push({ account_id: accounts.defaultExpense, debit: chargesBase, credit: 0, description: "Bank charges" });
  }
  if (tdsBase > 0) {
    if (!accounts.taxRecoverable) throw new Error("Chart of accounts is missing a Tax Recoverable account for TDS.");
    lines.push({ account_id: accounts.taxRecoverable, debit: tdsBase, credit: 0, description: "TDS deducted at source" });
  }
  if (arCreditBase > 0) lines.push({ account_id: accounts.receivable, debit: 0, credit: arCreditBase, description: "Customer payment" });
  if (advancesBase > 0) {
    if (!accounts.customerAdvances) throw new Error("Chart of accounts is missing a Customer Advances account.");
    lines.push({ account_id: accounts.customerAdvances, debit: 0, credit: advancesBase, description: "Customer advance received" });
  }

  // Realized exchange gain/loss balances bank (payment rate) against AR (booking rate).
  const fx = round2(round2(depositToBank + chargesBase + tdsBase) - round2(arCreditBase + advancesBase));
  if (fx !== 0) {
    const fxRows = (await tx.$queryRawUnsafe(`SELECT id FROM accounts WHERE org_id = $1::uuid AND code = '6900' LIMIT 1`, orgId)) as Array<{ id: string }>;
    if (!fxRows[0]) throw new Error("Add an Exchange Gain/Loss account (code 6900) to record currency differences.");
    if (fx > 0) lines.push({ account_id: fxRows[0].id, debit: 0, credit: fx, description: "Exchange gain" });
    else lines.push({ account_id: fxRows[0].id, debit: -fx, credit: 0, description: "Exchange loss" });
  }
  return lines;
}

/** List received payments with customer, deposit account, and applied invoice numbers. */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const page = Math.max(Number(request.nextUrl.searchParams.get("page") ?? "1"), 1);
  const perPage = Math.min(Math.max(Number(request.nextUrl.searchParams.get("per_page") ?? "25"), 1), 100);
  const offset = (page - 1) * perPage;
  try {
    const countRows = (await prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM payments WHERE org_id = ${orgId}::uuid AND payment_type = 'received'`) as Array<{ count: bigint }>;
    const data = (await prisma.$queryRaw`
      SELECT p.*, to_char(p.payment_date,'YYYY-MM-DD') AS date, p.method AS mode, p.unapplied_amount AS unused_amount,
             c.display_name AS customer_name, w.name AS location,
             (SELECT string_agg(i.invoice_number, ', ') FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id WHERE pa.payment_id = p.id) AS invoice_no
      FROM payments p
      LEFT JOIN contacts c ON c.id = p.contact_id
      LEFT JOIN warehouses w ON w.id = p.warehouse_id
      WHERE p.org_id = ${orgId}::uuid AND p.payment_type = 'received'
      ORDER BY p.payment_date DESC, p.created_at DESC
      LIMIT ${perPage} OFFSET ${offset}
    `) as unknown[];
    return ok(data, { total: Number(countRows[0]?.count ?? 0), page, per_page: perPage });
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = receivedPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The payment is invalid.", details: parsed.error.flatten() });
  }
  const input = parsed.data;

  const allocatedSum = round2(input.allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  const isAdvanceApplication = input.source === "advance";
  // Applying an advance moves exactly the allocated amount from advances to A/R.
  const amount = isAdvanceApplication ? allocatedSum : round2(input.amount);

  if (isAdvanceApplication) {
    if (allocatedSum <= 0) return fail(422, { code: "NO_ALLOCATION", message: "Choose invoices to apply the advance to." });
  } else {
    if (!input.deposit_account_id) return fail(422, { code: "DEPOSIT_REQUIRED", message: "Select a deposit account." });
    if (allocatedSum > amount + 0.001) return fail(422, { code: "OVER_ALLOCATED", message: "Allocated amount exceeds the payment amount." });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const accounts = await resolveControlAccounts(tx, orgId);
      const unapplied = isAdvanceApplication ? 0 : round2(amount - allocatedSum);

      const bankCharges = isAdvanceApplication ? 0 : round2(input.bank_charges ?? 0);
      const tds = isAdvanceApplication ? 0 : round2(input.tds_amount ?? 0);
      const paymentNumber = input.payment_number && input.payment_number.length > 0 ? input.payment_number : await nextDocumentNumber(tx, orgId, "payment_received", { locationId: input.warehouse_id ?? null });
      const reference = input.reference ?? input.reference_number ?? null;
      const paymentRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO payments (
          org_id, contact_id, payment_type, payment_number, warehouse_id, payment_date, amount, unapplied_amount, bank_charges, tds_amount, currency, exchange_rate, method, reference, deposit_account_id, status, memo
        ) VALUES (
          ${orgId}::uuid, ${input.contact_id}::uuid, 'received', ${paymentNumber}, ${input.warehouse_id ?? null}::uuid, ${input.payment_date}::date, ${amount}, ${unapplied}, ${bankCharges}, ${tds}, ${input.currency}, ${input.exchange_rate},
          ${input.method}, ${reference}, ${input.deposit_account_id ?? null}::uuid, 'posted', ${input.memo ?? null}
        ) RETURNING id`;
      const paymentId = paymentRows[0].id;

      for (const allocation of input.allocations) {
        const allocationAmount = round2(allocation.amount);
        if (allocationAmount <= 0) continue;
        await tx.$executeRaw`
          INSERT INTO payment_allocations (org_id, payment_id, invoice_id, amount)
          VALUES (${orgId}::uuid, ${paymentId}::uuid, ${allocation.invoice_id}::uuid, ${allocationAmount})`;
        await tx.$executeRaw`
          UPDATE invoices SET
            balance_due = GREATEST(0, ROUND(balance_due - ${allocationAmount}, 2)),
            status = CASE WHEN ROUND(balance_due - ${allocationAmount}, 2) <= 0 THEN 'paid' ELSE 'partial' END,
            updated_at = now()
          WHERE id = ${allocation.invoice_id}::uuid AND org_id = ${orgId}::uuid`;
      }

      const lines = await buildReceiptLines(tx, orgId, accounts, {
        isAdvanceApplication, amount, allocations: input.allocations, allocatedSum, bankCharges, tds, unapplied,
        depositAccountId: input.deposit_account_id ?? null, exchangeRate: input.exchange_rate, reference: input.reference ?? null
      });

      const journalEntryId = await createJournalEntry(tx, {
        orgId,
        entryDate: input.payment_date,
        memo: isAdvanceApplication ? "Advance applied" : `Payment received ${input.reference ?? ""}`.trim(),
        sourceType: "payment",
        sourceId: paymentId,
        createdBy: userId,
        lines
      });
      await tx.$executeRaw`UPDATE payments SET journal_entry_id = ${journalEntryId}::uuid WHERE id = ${paymentId}::uuid`;

      return { id: paymentId };
    });

    const rows = (await prisma.$queryRaw`SELECT * FROM payments WHERE id = ${result.id}::uuid`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "PAYMENT_FAILED", message: errorMessage(error) });
  }
}

/** Edit a received payment: reverse its prior effect, then re-apply the new values. */
export async function PUT(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  const paymentId = request.nextUrl.searchParams.get("id");
  if (!paymentId) return fail(422, { code: "ID_REQUIRED", message: "A payment id is required." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = receivedPaymentSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The payment is invalid.", details: parsed.error.flatten() });
  const input = parsed.data;

  const allocatedSum = round2(input.allocations.reduce((sum, a) => sum + a.amount, 0));
  const isAdvanceApplication = input.source === "advance";
  const amount = isAdvanceApplication ? allocatedSum : round2(input.amount);
  if (!isAdvanceApplication && !input.deposit_account_id) return fail(422, { code: "DEPOSIT_REQUIRED", message: "Select a deposit account." });
  if (!isAdvanceApplication && allocatedSum > amount + 0.001) return fail(422, { code: "OVER_ALLOCATED", message: "Allocated amount exceeds the payment amount." });

  try {
    await prisma.$transaction(async (tx) => {
      const existing = (await tx.$queryRaw`SELECT id FROM payments WHERE id = ${paymentId}::uuid AND org_id = ${orgId}::uuid AND payment_type = 'received' LIMIT 1`) as unknown[];
      if (!existing.length) throw new Error("Payment was not found.");

      // 1) Reverse the prior allocations (restore invoice balances) and journal.
      const oldAllocs = (await tx.$queryRaw`SELECT invoice_id, amount FROM payment_allocations WHERE payment_id = ${paymentId}::uuid AND org_id = ${orgId}::uuid`) as Array<{ invoice_id: string; amount: string }>;
      for (const a of oldAllocs) {
        await tx.$executeRaw`UPDATE invoices SET balance_due = ROUND(balance_due + ${round2(Number(a.amount))}, 2), status = 'sent', updated_at = now() WHERE id = ${a.invoice_id}::uuid AND org_id = ${orgId}::uuid`;
      }
      await tx.$executeRaw`DELETE FROM payment_allocations WHERE payment_id = ${paymentId}::uuid AND org_id = ${orgId}::uuid`;
      await reverseJournalFor(tx, orgId, "payment", paymentId);

      // 2) Re-apply with the new values.
      const accounts = await resolveControlAccounts(tx, orgId);
      const unapplied = isAdvanceApplication ? 0 : round2(amount - allocatedSum);
      const bankCharges = isAdvanceApplication ? 0 : round2(input.bank_charges ?? 0);
      const tds = isAdvanceApplication ? 0 : round2(input.tds_amount ?? 0);
      const reference = input.reference ?? input.reference_number ?? null;
      await tx.$executeRaw`
        UPDATE payments SET contact_id = ${input.contact_id}::uuid, warehouse_id = ${input.warehouse_id ?? null}::uuid,
          payment_date = ${input.payment_date}::date, amount = ${amount}, unapplied_amount = ${unapplied}, bank_charges = ${bankCharges}, tds_amount = ${tds}, currency = ${input.currency}, exchange_rate = ${input.exchange_rate},
          method = ${input.method}, reference = ${reference}, deposit_account_id = ${input.deposit_account_id ?? null}::uuid, memo = ${input.memo ?? null}, updated_at = now()
        WHERE id = ${paymentId}::uuid AND org_id = ${orgId}::uuid`;

      for (const allocation of input.allocations) {
        const allocationAmount = round2(allocation.amount);
        if (allocationAmount <= 0) continue;
        await tx.$executeRaw`INSERT INTO payment_allocations (org_id, payment_id, invoice_id, amount) VALUES (${orgId}::uuid, ${paymentId}::uuid, ${allocation.invoice_id}::uuid, ${allocationAmount})`;
        await tx.$executeRaw`UPDATE invoices SET balance_due = GREATEST(0, ROUND(balance_due - ${allocationAmount}, 2)), status = CASE WHEN ROUND(balance_due - ${allocationAmount}, 2) <= 0 THEN 'paid' ELSE 'partial' END, updated_at = now() WHERE id = ${allocation.invoice_id}::uuid AND org_id = ${orgId}::uuid`;
      }

      const lines = await buildReceiptLines(tx, orgId, accounts, {
        isAdvanceApplication, amount, allocations: input.allocations, allocatedSum, bankCharges, tds, unapplied,
        depositAccountId: input.deposit_account_id ?? null, exchangeRate: input.exchange_rate, reference
      });
      const journalEntryId = await createJournalEntry(tx, { orgId, entryDate: input.payment_date, memo: `Payment received ${reference ?? ""}`.trim(), sourceType: "payment", sourceId: paymentId, createdBy: userId, lines });
      await tx.$executeRaw`UPDATE payments SET journal_entry_id = ${journalEntryId}::uuid WHERE id = ${paymentId}::uuid`;
    });
    const rows = (await prisma.$queryRaw`SELECT * FROM payments WHERE id = ${paymentId}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "PAYMENT_UPDATE_FAILED", message: errorMessage(error) });
  }
}
