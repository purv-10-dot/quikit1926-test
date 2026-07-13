import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { createJournalEntry, resolveControlAccounts, round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Refund the remaining credit to the customer (Dr A/R to consume the credit, Cr Bank). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: { amount?: number } = {};
  try { body = (await request.json()) as { amount?: number }; } catch { body = {}; }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ credit_note_number: string; balance: string; ar_account_id: string | null; issue_date: Date }>>`
        SELECT credit_note_number, balance, ar_account_id, to_char(issue_date,'YYYY-MM-DD') AS issue_date
        FROM credit_notes WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!rows.length) throw new Error("Credit note was not found.");
      const cn = rows[0];
      const available = round2(Number(cn.balance));
      const amount = round2(Math.min(body.amount && body.amount > 0 ? body.amount : available, available));
      if (amount <= 0) throw new Error("No credit balance remaining to refund.");

      const accounts = await resolveControlAccounts(tx, orgId);
      const receivable = cn.ar_account_id ?? accounts.receivable;
      const bank = accounts.cash; // bank, falling back to cash
      if (!bank) throw new Error("No bank or cash account found to pay the refund from.");

      await createJournalEntry(tx, {
        orgId, entryDate: String(cn.issue_date), memo: `Refund of credit note ${cn.credit_note_number}`,
        sourceType: "credit_note_refund", sourceId: params.id, createdBy: userId,
        lines: [
          { account_id: receivable, debit: amount, credit: 0, description: `Refund ${cn.credit_note_number}` },
          { account_id: bank, debit: 0, credit: amount, description: `Refund ${cn.credit_note_number}` }
        ]
      });

      const newBalance = round2(available - amount);
      await tx.$executeRaw`UPDATE credit_notes SET balance = ${newBalance}, status = ${newBalance <= 0 ? "closed" : "open"}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { amount, newBalance };
    });
    return ok({ id: params.id, refunded: result.amount, balance: result.newBalance });
  } catch (error) {
    return fail(400, { code: "REFUND_FAILED", message: errorMessage(error) });
  }
}
