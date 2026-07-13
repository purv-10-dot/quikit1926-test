import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const fiscalYear = Number(searchParams.get("fiscal_year") ?? new Date().getFullYear());
  const from = `${fiscalYear}-04-01`;
  const to = `${fiscalYear + 1}-03-31`;

  try {
    const [budgetsRes, accountsRes, jelRes] = await Promise.all([
      db
        .from("budgets")
        .select(`*, budget_lines(account_id, month, amount)`)
        .eq("org_id", orgId)
        .eq("fiscal_year", fiscalYear),
      db
        .from("accounts")
        .select("id, code, name, account_type")
        .eq("org_id", orgId)
        .eq("is_active", true),
      db
        .from("journal_entry_lines")
        .select(`account_id, debit, credit, journal_entries!journal_entry_id(date)`)
        .eq("journal_entries.org_id", orgId)
        .gte("journal_entries.date", from)
        .lte("journal_entries.date", to)
        .eq("journal_entries.status", "posted")
    ]);

    const budgets = budgetsRes.data ?? [];
    const accounts = accountsRes.data ?? [];
    const jeLines = jelRes.data ?? [];

    const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]));

    // Compute actuals by account
    const actualsMap = new Map<string, number>();
    for (const line of jeLines as Record<string, unknown>[]) {
      const accId = line.account_id as string;
      const existing = actualsMap.get(accId) ?? 0;
      actualsMap.set(accId, existing + Number(line.debit ?? 0) - Number(line.credit ?? 0));
    }

    // Build budget vs actual rows
    const rows: Record<string, unknown>[] = [];
    for (const budget of budgets) {
      const lines = (budget.budget_lines as Record<string, unknown>[]) ?? [];
      const budgetByAccount = new Map<string, number>();
      for (const bl of lines) {
        const accId = bl.account_id as string;
        budgetByAccount.set(accId, (budgetByAccount.get(accId) ?? 0) + Number(bl.amount ?? 0));
      }

      for (const [accId, budgeted] of budgetByAccount.entries()) {
        const actual = actualsMap.get(accId) ?? 0;
        const account = accountMap[accId];
        rows.push({
          account_id: accId,
          account_code: account?.code,
          account_name: account?.name,
          account_type: account?.account_type,
          budget_name: (budget as Record<string, unknown>).name,
          budgeted,
          actual,
          variance: actual - budgeted,
          variance_pct: budgeted !== 0 ? ((actual - budgeted) / Math.abs(budgeted)) * 100 : null
        });
      }
    }

    const totalBudgeted = rows.reduce((s, r) => s + Number(r.budgeted ?? 0), 0);
    const totalActual = rows.reduce((s, r) => s + Number(r.actual ?? 0), 0);

    return ok(rows, {
      fiscal_year: fiscalYear,
      period: { from, to },
      summary: { total_budgeted: totalBudgeted, total_actual: totalActual, total_variance: totalActual - totalBudgeted }
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
