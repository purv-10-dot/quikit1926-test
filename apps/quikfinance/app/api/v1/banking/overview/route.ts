import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/** Banking overview: cash/bank totals from the GL + the managed bank accounts with their book balance and uncategorized count. */
export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const totals = (await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN account_type = 'cash' THEN balance ELSE 0 END), 0) AS cash_in_hand,
        COALESCE(SUM(CASE WHEN account_type = 'bank' THEN balance ELSE 0 END), 0) AS bank_balance
      FROM v_account_balances WHERE org_id = ${orgId}::uuid
    `) as Array<{ cash_in_hand: string; bank_balance: string }>;

    const accounts = (await prisma.$queryRaw`
      SELECT b.id, b.name, b.kind, b.institution_name, b.account_number_last4, b.currency, b.is_primary, b.account_id,
             a.code AS account_code, a.account_type,
             COALESCE(vb.balance, 0) AS book_balance,
             (SELECT COUNT(*) FROM bank_transactions t WHERE t.bank_account_id = b.id AND t.status = 'uncategorized')::int AS uncategorized
      FROM bank_accounts b
      LEFT JOIN accounts a ON a.id = b.account_id
      LEFT JOIN v_account_balances vb ON vb.id = b.account_id
      WHERE b.org_id = ${orgId}::uuid AND b.is_active = true
      ORDER BY b.is_primary DESC, b.name ASC
    `) as Array<Record<string, unknown>>;

    return ok({
      cash_in_hand: Number(totals[0]?.cash_in_hand ?? 0),
      bank_balance: Number(totals[0]?.bank_balance ?? 0),
      accounts: accounts.map((a) => ({
        id: a.id, name: a.name, kind: a.kind, institution_name: a.institution_name,
        account_number_last4: a.account_number_last4, currency: a.currency, is_primary: a.is_primary,
        account_code: a.account_code, account_type: a.account_type,
        book_balance: Number(a.book_balance ?? 0), uncategorized: Number(a.uncategorized ?? 0)
      }))
    });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}
