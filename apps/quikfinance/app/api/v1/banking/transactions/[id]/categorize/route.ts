import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { createJournalEntry, reverseJournalFor, round2, type JournalLine } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

const schema = z.object({ account_id: z.string().uuid() });

/**
 * Categorize an imported bank transaction by posting a balanced journal entry
 * between the bank's ledger account and the chosen category account:
 *   deposit  (money in)  → Dr Bank / Cr Category
 *   withdrawal (money out) → Dr Category / Cr Bank
 * Re-categorizing reverses the prior entry first (idempotent).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can categorize transactions." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Choose a category account." });
  const categoryAccountId = parsed.data.account_id;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT t.amount, to_char(t.transaction_date,'YYYY-MM-DD') AS date, t.description, t.payee, b.account_id AS bank_gl
      FROM bank_transactions t JOIN bank_accounts b ON b.id = t.bank_account_id
      WHERE t.id = ${params.id}::uuid AND t.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<{ amount: string; date: string; description: string | null; payee: string | null; bank_gl: string | null }>;
    const txn = rows[0];
    if (!txn) return fail(404, { code: "NOT_FOUND", message: "Transaction not found." });
    if (!txn.bank_gl) return fail(400, { code: "NO_LEDGER_ACCOUNT", message: "Link this bank account to a ledger account before categorizing." });

    const amount = round2(Math.abs(Number(txn.amount)));
    if (amount === 0) return fail(400, { code: "ZERO_AMOUNT", message: "Cannot categorize a zero-amount transaction." });
    const memo = `Bank: ${txn.payee || txn.description || "transaction"}`;
    const isDeposit = Number(txn.amount) >= 0;

    const journalEntryId = await prisma.$transaction(async (tx) => {
      await reverseJournalFor(tx, orgId, "bank_transaction", params.id);
      const lines: JournalLine[] = isDeposit
        ? [
            { account_id: txn.bank_gl as string, debit: amount, credit: 0, description: memo },
            { account_id: categoryAccountId, debit: 0, credit: amount, description: memo }
          ]
        : [
            { account_id: categoryAccountId, debit: amount, credit: 0, description: memo },
            { account_id: txn.bank_gl as string, debit: 0, credit: amount, description: memo }
          ];
      const jeId = await createJournalEntry(tx, { orgId, entryDate: txn.date, memo, sourceType: "bank_transaction", sourceId: params.id, createdBy: userId, lines });
      await tx.$executeRaw`UPDATE bank_transactions SET status = 'categorized', matched_journal_entry_id = ${jeId}::uuid WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return jeId;
    });

    return ok({ id: params.id, journal_entry_id: journalEntryId });
  } catch (error) {
    return fail(400, { code: "CATEGORIZE_FAILED", message: errorMessage(error) });
  }
}
