import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

const n = (x: unknown) => Number(x ?? 0);
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number) => (b === 0 ? 0 : r2((a / b) * 100));

/**
 * Cost Intelligence — fixed vs variable cost structure, break-even, margin of
 * safety, and a downturn simulation. Variable cost ≈ COGS (scales with sales);
 * fixed cost ≈ operating expenses (stay in a downturn). FY-scoped by default.
 */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const orgRows = (await prisma.$queryRaw`SELECT COALESCE(fiscal_year_start,4) AS fym FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ fym: number }>;
    const fym = Math.min(Math.max(n(orgRows[0]?.fym) || 4, 1), 12);
    const now = new Date();
    let sy = now.getUTCFullYear();
    if (now.getUTCMonth() + 1 < fym) sy -= 1;
    const pad = (x: number) => String(x).padStart(2, "0");
    const from = request.nextUrl.searchParams.get("from") || `${sy}-${pad(fym)}-01`;
    const to = request.nextUrl.searchParams.get("to") || `${sy + 1}-${pad(fym)}-01`;
    const label = request.nextUrl.searchParams.get("from") ? `${from} → ${to}` : (fym === 1 ? `FY ${sy}` : `FY ${sy}-${String(sy + 1).slice(-2)}`);

    const pl = (await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN a.account_type IN ('revenue','other_income') THEN jl.credit - jl.debit ELSE 0 END),0) AS income,
        COALESCE(SUM(CASE WHEN a.account_type IN ('expense','other_expense') THEN jl.debit - jl.credit ELSE 0 END),0) AS fixed,
        COALESCE(SUM(CASE WHEN a.account_type = 'cost_of_goods_sold' THEN jl.debit - jl.credit ELSE 0 END),0) AS variable
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.org_id = ${orgId}::uuid AND je.entry_date >= ${from}::date AND je.entry_date < ${to}::date
    `) as Array<{ income: string; fixed: string; variable: string }>;

    const revenue = r2(n(pl[0]?.income));
    const variableCost = r2(n(pl[0]?.variable));
    const fixedCost = r2(n(pl[0]?.fixed));
    const contribution = r2(revenue - variableCost);
    const cmRatio = pct(contribution, revenue); // %
    const operatingProfit = r2(contribution - fixedCost);
    const breakEven = cmRatio > 0 ? r2(fixedCost / (cmRatio / 100)) : null;
    const marginOfSafety = breakEven !== null && revenue > 0 ? pct(revenue - breakEven, revenue) : null; // % sales can fall before a loss
    const dol = operatingProfit > 0 ? r2(contribution / operatingProfit) : null; // degree of operating leverage
    const fixedShare = pct(fixedCost, fixedCost + variableCost);

    // Downturn simulation: variable cost scales with sales, fixed cost stays.
    const scenarios = [0, 10, 20, 30].map((drop) => {
      const f = 1 - drop / 100;
      const rev = r2(revenue * f);
      const vc = r2(variableCost * f);
      const profit = r2(rev - vc - fixedCost);
      return { drop, revenue: rev, variableCost: vc, fixedCost, profit };
    });

    // Top fixed-cost accounts.
    const fixedBreakdown = (await prisma.$queryRaw`
      SELECT a.name, COALESCE(SUM(jl.debit - jl.credit),0) AS amt
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.org_id = ${orgId}::uuid AND a.account_type IN ('expense','other_expense')
        AND je.entry_date >= ${from}::date AND je.entry_date < ${to}::date
      GROUP BY a.name HAVING SUM(jl.debit - jl.credit) <> 0 ORDER BY amt DESC LIMIT 6
    `) as Array<{ name: string; amt: string }>;

    // Risk verdict.
    const downturnProfit = scenarios[2].profit; // at -20%
    const risk =
      operatingProfit <= 0 ? { level: "critical", label: "Already loss-making", note: "You're below break-even now — fixed costs must come down or revenue up." }
        : marginOfSafety !== null && marginOfSafety < 20 ? { level: "high", label: "High fixed-cost risk", note: `A 20% sales drop turns ${operatingProfit > 0 ? "this profit into a loss" : "worse"}. Your safety margin is thin.` }
          : fixedShare > 60 ? { level: "watch", label: "Fixed-cost heavy", note: "A large share of costs are fixed — watch operating leverage in a downturn." }
            : { level: "ok", label: "Resilient cost base", note: "Costs flex with sales; a downturn hurts less." };

    return ok({
      period: { from, to, label },
      revenue, variableCost, fixedCost, contribution, cmRatio, operatingProfit,
      breakEven, marginOfSafety, dol, fixedShare,
      scenarios,
      fixedBreakdown: fixedBreakdown.map((f) => ({ name: f.name, amount: r2(n(f.amt)) })),
      risk,
      downturnProfit
    });
  } catch (error) {
    return fail(500, { code: "COST_INTEL_FAILED", message: errorMessage(error) });
  }
}
