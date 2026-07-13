import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { createJournalEntry, resolveControlAccounts, round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Refund the unused (excess) portion of a received payment back to the customer. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: { amount?: number } = {};
  try { body = (await request.json()) as { amount?: number }; } catch { body = {}; }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ unapplied_amount: string; refunded_amount: string; deposit_account_id: string | null; payment_number: string; payment_date: Date }>>`
        SELECT unapplied_amount, refunded_amount, deposit_account_id, payment_number, to_char(payment_date,'YYYY-MM-DD') AS payment_date
        FROM payments WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND payment_type = 'received' LIMIT 1`;
      if (!rows.length) throw new Error("Payment was not found.");
      const p = rows[0];
      const available = round2(Number(p.unapplied_amount));
      const amount = round2(Math.min(body.amount && body.amount > 0 ? body.amount : available, available));
      if (amount <= 0) throw new Error("No unused amount available to refund.");

      const accounts = await resolveControlAccounts(tx, orgId);
      const bank = p.deposit_account_id ?? accounts.cash;
      if (!bank) throw new Error("No deposit/bank account found to pay the refund from.");
      if (!accounts.customerAdvances) throw new Error("Chart of accounts is missing a Customer Advances account.");

      await createJournalEntry(tx, {
        orgId, entryDate: String(p.payment_date), memo: `Refund of payment ${p.payment_number}`,
        sourceType: "payment_refund", sourceId: params.id, createdBy: userId,
        lines: [
          { account_id: accounts.customerAdvances, debit: amount, credit: 0, description: `Refund ${p.payment_number}` },
          { account_id: bank, debit: 0, credit: amount, description: `Refund ${p.payment_number}` }
        ]
      });

      const newUnapplied = round2(available - amount);
      await tx.$executeRaw`UPDATE payments SET unapplied_amount = ${newUnapplied}, refunded_amount = ${round2(Number(p.refunded_amount) + amount)}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { amount, newUnapplied };
    });
    return ok({ id: params.id, refunded: result.amount, unused: result.newUnapplied });
  } catch (error) {
    return fail(400, { code: "REFUND_FAILED", message: errorMessage(error) });
  }
}
