import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type Kind = "money" | "percent" | "number" | "text";
type PillarRow = { label: string; value: number | string; kind: Kind };
type Pillar = { key: string; num: string; title: string; desc: string; value: number | string; kind: Kind; tone: "good" | "watch" | "risk"; rows: PillarRow[] };

const n = (x: unknown) => Number(x ?? 0);
const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number) => (b === 0 ? 0 : r2((a / b) * 100));

/** Six pillars of financial intelligence, scoped to the current financial year. */
export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const orgRows = (await prisma.$queryRaw`SELECT COALESCE(fiscal_year_start, 4) AS fym FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ fym: number }>;
    const fyStartMonth = Math.min(Math.max(n(orgRows[0]?.fym) || 4, 1), 12);
    const now = new Date();
    let startYear = now.getUTCFullYear();
    if (now.getUTCMonth() + 1 < fyStartMonth) startYear -= 1;
    const pad = (x: number) => String(x).padStart(2, "0");
    const fyFrom = `${startYear}-${pad(fyStartMonth)}-01`;
    const fyToExclusive = `${startYear + 1}-${pad(fyStartMonth)}-01`;
    const fyLabel = fyStartMonth === 1 ? `FY ${startYear}` : `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
    const monthsElapsed = Math.max(1, Math.round((now.getTime() - new Date(`${fyFrom}T00:00:00Z`).getTime()) / (30.4 * 86400000)));

    // P&L for the financial year.
    const pl = (await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN a.account_type IN ('revenue','other_income') THEN jl.credit - jl.debit ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN a.account_type IN ('expense','other_expense') THEN jl.debit - jl.credit ELSE 0 END), 0) AS opex,
        COALESCE(SUM(CASE WHEN a.account_type = 'cost_of_goods_sold' THEN jl.debit - jl.credit ELSE 0 END), 0) AS cogs
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.org_id = ${orgId}::uuid AND je.entry_date >= ${fyFrom}::date AND je.entry_date < ${fyToExclusive}::date
    `) as Array<{ income: string; opex: string; cogs: string }>;
    const income = r2(n(pl[0]?.income)), opex = r2(n(pl[0]?.opex)), cogs = r2(n(pl[0]?.cogs));
    const grossProfit = r2(income - cogs);
    const netProfit = r2(income - cogs - opex);
    const totalCost = r2(opex + cogs);

    // Balance-sheet snapshot (as of now).
    const bs = (await prisma.$queryRaw`
      SELECT
        COALESCE(SUM(CASE WHEN account_type IN ('cash','bank') THEN balance ELSE 0 END),0) AS cash,
        COALESCE(SUM(CASE WHEN account_type IN ('cash','bank','accounts_receivable','other_current_asset') THEN balance ELSE 0 END),0) AS curr_assets,
        COALESCE(SUM(CASE WHEN account_type IN ('accounts_payable','other_current_liability') THEN balance ELSE 0 END),0) AS curr_liab,
        COALESCE(SUM(CASE WHEN account_type='accounts_receivable' THEN balance ELSE 0 END),0) AS ar,
        COALESCE(SUM(CASE WHEN account_type='accounts_payable' THEN balance ELSE 0 END),0) AS ap,
        COALESCE(SUM(CASE WHEN account_type='fixed_asset' THEN balance ELSE 0 END),0) AS fixed_assets,
        COALESCE(SUM(CASE WHEN account_type IN ('equity','retained_earnings') THEN balance ELSE 0 END),0) AS equity,
        COALESCE(SUM(CASE WHEN account_type='long_term_liability' THEN balance ELSE 0 END),0) AS lt_debt,
        COALESCE(SUM(CASE WHEN account_type IN ('cash','bank','accounts_receivable','other_current_asset','fixed_asset','other_asset') THEN balance ELSE 0 END),0) AS total_assets
      FROM v_account_balances WHERE org_id = ${orgId}::uuid
    `) as Array<Record<string, string>>;
    const b = bs[0] ?? {};
    const cash = r2(n(b.cash)), currentAssets = r2(n(b.curr_assets)), currentLiab = r2(n(b.curr_liab));
    const workingCapital = r2(currentAssets - currentLiab);
    const fixedAssets = r2(n(b.fixed_assets)), equity = r2(n(b.equity)), ltDebt = r2(n(b.lt_debt)), totalAssets = r2(n(b.total_assets)), ar = r2(n(b.ar));

    // Top expense categories (FY).
    const topCost = (await prisma.$queryRaw`
      SELECT a.name, COALESCE(SUM(jl.debit - jl.credit),0) AS amt
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      JOIN accounts a ON a.id = jl.account_id
      WHERE jl.org_id = ${orgId}::uuid AND a.account_type IN ('expense','other_expense','cost_of_goods_sold')
        AND je.entry_date >= ${fyFrom}::date AND je.entry_date < ${fyToExclusive}::date
      GROUP BY a.name HAVING SUM(jl.debit - jl.credit) <> 0 ORDER BY amt DESC LIMIT 4
    `) as Array<{ name: string; amt: string }>;

    // Risk signals: overdue receivables + customer concentration in FY revenue.
    const overdueRows = (await prisma.$queryRaw`SELECT COALESCE(SUM(balance_due),0) AS v FROM invoices WHERE org_id = ${orgId}::uuid AND status NOT IN ('void','draft','cancelled') AND balance_due > 0 AND due_date < CURRENT_DATE`) as Array<{ v: string }>;
    const overdue = r2(n(overdueRows[0]?.v));
    const concRows = (await prisma.$queryRaw`
      SELECT c.display_name AS name, COALESCE(SUM(i.total),0) AS amt
      FROM invoices i JOIN contacts c ON c.id = i.contact_id
      WHERE i.org_id = ${orgId}::uuid AND i.status NOT IN ('void','draft','cancelled') AND i.issue_date >= ${fyFrom}::date AND i.issue_date < ${fyToExclusive}::date
      GROUP BY c.display_name ORDER BY amt DESC LIMIT 1
    `) as Array<{ name: string; amt: string }>;
    const topCustomer = concRows[0] ? { name: concRows[0].name, amt: r2(n(concRows[0].amt)) } : null;
    const concentration = topCustomer && income > 0 ? pct(topCustomer.amt, income) : 0;
    const avgMonthlyCost = r2(totalCost / monthsElapsed);
    const runwayMonths = avgMonthlyCost > 0 ? r2(cash / avgMonthlyCost) : 0;
    const roa = totalAssets > 0 ? pct(netProfit, totalAssets) : 0;
    const debtToEquity = equity > 0 ? r2((ltDebt + currentLiab) / equity) : 0;

    const pillars: Pillar[] = [
      {
        key: "cash", num: "01", title: "Cash", desc: "Liquidity and working capital. Can you take money out?",
        value: cash, kind: "money", tone: cash <= 0 ? "risk" : workingCapital < 0 ? "watch" : "good",
        rows: [
          { label: "Cash & bank", value: cash, kind: "money" },
          { label: "Working capital", value: workingCapital, kind: "money" },
          { label: "Receivables due", value: ar, kind: "money" },
          { label: "Cash runway", value: `${runwayMonths} mo`, kind: "text" }
        ]
      },
      {
        key: "profit", num: "02", title: "Profit", desc: "Real profitability for the year.",
        value: netProfit, kind: "money", tone: netProfit < 0 ? "risk" : pct(netProfit, income) < 5 ? "watch" : "good",
        rows: [
          { label: "Revenue (FY)", value: income, kind: "money" },
          { label: "Gross profit", value: grossProfit, kind: "money" },
          { label: "Net profit", value: netProfit, kind: "money" },
          { label: "Net margin", value: pct(netProfit, income), kind: "percent" }
        ]
      },
      {
        key: "cost", num: "03", title: "Cost", desc: "Cost structure and break-even.",
        value: totalCost, kind: "money", tone: income > 0 && pct(totalCost, income) > 90 ? "watch" : "good",
        rows: [
          { label: "Cost of goods sold", value: cogs, kind: "money" },
          { label: "Operating expenses", value: opex, kind: "money" },
          ...topCost.slice(0, 2).map((c) => ({ label: `Top: ${c.name}`, value: r2(n(c.amt)), kind: "money" as Kind }))
        ]
      },
      {
        key: "investment", num: "04", title: "Investment", desc: "Do assets earn more than they cost?",
        value: roa, kind: "percent", tone: netProfit < 0 ? "risk" : roa < 8 ? "watch" : "good",
        rows: [
          { label: "Fixed assets", value: fixedAssets, kind: "money" },
          { label: "Total assets", value: totalAssets, kind: "money" },
          { label: "Return on assets", value: roa, kind: "percent" }
        ]
      },
      {
        key: "capital", num: "05", title: "Capital", desc: "Funding growth safely.",
        value: equity, kind: "money", tone: debtToEquity > 2 ? "risk" : debtToEquity > 1 ? "watch" : "good",
        rows: [
          { label: "Owner's equity", value: equity, kind: "money" },
          { label: "Long-term debt", value: ltDebt, kind: "money" },
          { label: "Debt-to-equity", value: `${debtToEquity}×`, kind: "text" }
        ]
      },
      {
        key: "risk", num: "06", title: "Risk", desc: "What single event can hurt you?",
        value: concentration, kind: "percent", tone: overdue > cash || concentration > 50 ? "risk" : concentration > 30 || overdue > 0 ? "watch" : "good",
        rows: [
          { label: "Overdue receivables", value: overdue, kind: "money" },
          { label: topCustomer ? `Top customer: ${topCustomer.name}` : "Customer concentration", value: concentration, kind: "percent" },
          { label: "Cash runway", value: `${runwayMonths} mo`, kind: "text" }
        ]
      }
    ];

    return ok({ fy: { label: fyLabel, from: fyFrom, to: fyToExclusive }, pillars });
  } catch (error) {
    return fail(500, { code: "PILLARS_FAILED", message: errorMessage(error) });
  }
}
