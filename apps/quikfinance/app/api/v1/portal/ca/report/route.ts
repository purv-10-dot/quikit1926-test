import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);
const INCOME = ["revenue", "other_income", "income"];

/**
 * CA portal accounting reports, scoped to the currently selected company
 * (client switcher). Reads the shared finance views so the numbers match the
 * finance app exactly. ?type=trial-balance|profit-loss|balance-sheet
 */
export async function GET(request: NextRequest) {
  const guard = await portalRoute("ca", "view");
  if (!guard.ok) return guard.response;
  const { orgId } = guard.context; // selected company
  const type = request.nextUrl.searchParams.get("type") ?? "trial-balance";

  try {
    if (type === "trial-balance") {
      const rows = (await prisma.$queryRaw`SELECT code, name, debit, credit FROM v_trial_balance WHERE org_id = ${orgId}::uuid AND (debit <> 0 OR credit <> 0) ORDER BY code`) as Array<{ code: string; name: string; debit: string; credit: string }>;
      const totalDebit = rows.reduce((s, r) => s + n(r.debit), 0);
      const totalCredit = rows.reduce((s, r) => s + n(r.credit), 0);
      return ok({ type, rows, totals: { debit: totalDebit, credit: totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 } });
    }

    if (type === "profit-loss") {
      const rows = (await prisma.$queryRaw`SELECT code, name, account_type, amount FROM v_profit_loss WHERE org_id = ${orgId}::uuid`) as Array<{ code: string; name: string; account_type: string; amount: string }>;
      // v_profit_loss is signed: income positive, expense negative. Net is the
      // sum of all lines. Present expenses as positive magnitudes for the UI.
      const income = rows.filter((r) => INCOME.includes(r.account_type));
      const expense = rows.filter((r) => !INCOME.includes(r.account_type)).map((r) => ({ ...r, amount: String(-n(r.amount)) }));
      const totalIncome = income.reduce((s, r) => s + n(r.amount), 0);
      const totalExpense = expense.reduce((s, r) => s + n(r.amount), 0);
      return ok({ type, income, expense, totals: { income: totalIncome, expense: totalExpense, net: totalIncome - totalExpense } });
    }

    if (type === "balance-sheet") {
      const rows = (await prisma.$queryRaw`SELECT code, name, account_type, balance FROM v_balance_sheet WHERE org_id = ${orgId}::uuid`) as Array<{ code: string; name: string; account_type: string; balance: string }>;
      const group = (types: string[]) => rows.filter((r) => types.includes(r.account_type));
      const assets = group(["asset", "current_asset", "fixed_asset", "bank", "cash", "accounts_receivable", "other_asset"]);
      const liabilities = group(["liability", "current_liability", "accounts_payable", "other_liability"]);
      const equity = group(["equity"]);
      const sum = (list: typeof rows) => list.reduce((s, r) => s + n(r.balance), 0);
      return ok({ type, assets, liabilities, equity, totals: { assets: sum(assets), liabilities: sum(liabilities), equity: sum(equity) } });
    }

    return fail(422, { code: "BAD_TYPE", message: "Unknown report type." });
  } catch (error) {
    return fail(500, { code: "CA_REPORT_FAILED", message: errorMessage(error) });
  }
}
