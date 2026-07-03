import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { createJournalEntry, reverseJournalFor, round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

const ADJ_NAME = "Opening Balance Adjustments";

function groupFor(type: string): string {
  if (type === "accounts_receivable") return "Accounts Receivable";
  if (type === "accounts_payable") return "Accounts Payable";
  if (type === "bank") return "Bank";
  if (["cash", "other_current_asset", "fixed_asset", "other_asset"].includes(type)) return "Asset";
  if (["other_current_liability", "long_term_liability"].includes(type)) return "Liability";
  if (["equity", "retained_earnings"].includes(type)) return "Equity";
  if (["revenue", "other_income"].includes(type)) return "Income";
  return "Expense";
}

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const orgRows = (await prisma.$queryRaw`SELECT to_char(migration_date,'YYYY-MM-DD') AS migration_date FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ migration_date: string | null }>;

    const accounts = (await prisma.$queryRaw`
      SELECT a.id, a.code, a.name, a.account_type, COALESCE(vb.balance, 0) AS available
      FROM accounts a LEFT JOIN v_account_balances vb ON vb.id = a.id
      WHERE a.org_id = ${orgId}::uuid AND a.is_active = true AND a.name <> ${ADJ_NAME}
      ORDER BY a.account_type, a.code
    `) as Array<{ id: string; code: string | null; name: string; account_type: string; available: string }>;

    // Prefill from the current opening-balance journal entry, if any.
    const lines = (await prisma.$queryRaw`
      SELECT l.account_id, l.debit, l.credit
      FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
      WHERE je.org_id = ${orgId}::uuid AND je.source_type = 'opening_balance'
    `) as Array<{ account_id: string; debit: string; credit: string }>;
    const byAccount = new Map(lines.map((l) => [l.account_id, { debit: Number(l.debit), credit: Number(l.credit) }]));

    return ok({
      migration_date: orgRows[0]?.migration_date ?? null,
      accounts: accounts.map((a) => ({
        id: a.id, code: a.code ?? "", name: a.name, account_type: a.account_type, group: groupFor(a.account_type),
        available: Number(a.available), debit: byAccount.get(a.id)?.debit ?? 0, credit: byAccount.get(a.id)?.credit ?? 0
      }))
    });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

const bodySchema = z.object({
  migration_date: z.string().trim().min(8),
  lines: z.array(z.object({ account_id: z.string().uuid(), debit: z.coerce.number().min(0).default(0), credit: z.coerce.number().min(0).default(0) })).default([])
});

export async function POST(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins and accountants can set opening balances." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid opening balances.", details: parsed.error.flatten() });
  const { migration_date, lines } = parsed.data;
  const entered = lines.filter((l) => round2(l.debit) !== 0 || round2(l.credit) !== 0);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE organizations SET migration_date = ${migration_date}::date, updated_at = now() WHERE id = ${orgId}::uuid`;
      // Always clear the previous opening entry first.
      await reverseJournalFor(tx, orgId, "opening_balance", orgId);
      if (entered.length === 0) return;

      // Find or create the Opening Balance Adjustments account.
      const adjRows = (await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM accounts WHERE org_id = ${orgId}::uuid AND name = ${ADJ_NAME} LIMIT 1`);
      let adjId = adjRows[0]?.id;
      if (!adjId) {
        const created = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO accounts (org_id, name, account_type, is_system, is_active) VALUES (${orgId}::uuid, ${ADJ_NAME}, 'other_current_liability', true, true) RETURNING id`;
        adjId = created[0].id;
      }

      const jeLines = entered.map((l) => ({ account_id: l.account_id, debit: round2(l.debit), credit: round2(l.credit), description: "Opening balance" }));
      const totalDebit = round2(jeLines.reduce((s, l) => s + l.debit, 0));
      const totalCredit = round2(jeLines.reduce((s, l) => s + l.credit, 0));
      const diff = round2(totalDebit - totalCredit);
      if (diff > 0) jeLines.push({ account_id: adjId, debit: 0, credit: diff, description: "Opening balance adjustment" });
      else if (diff < 0) jeLines.push({ account_id: adjId, debit: -diff, credit: 0, description: "Opening balance adjustment" });

      await createJournalEntry(tx, {
        orgId, entryDate: migration_date, memo: "Opening balances", sourceType: "opening_balance", sourceId: orgId, createdBy: userId, lines: jeLines
      });
    });
    return ok({ migration_date, accounts_set: entered.length });
  } catch (error) {
    return fail(400, { code: "SAVE_FAILED", message: errorMessage(error) });
  }
}
