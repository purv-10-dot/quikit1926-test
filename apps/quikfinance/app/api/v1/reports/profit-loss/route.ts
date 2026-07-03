import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

// P&L account types → section. Income types use credit−debit; expense types use debit−credit
// so every section total reads as a natural positive figure.
const SECTIONS = [
  { key: "operating_income", label: "Operating Income", types: ["revenue"], normal: "credit" as const },
  { key: "cogs", label: "Cost of Goods Sold", types: ["cost_of_goods_sold"], normal: "debit" as const },
  { key: "operating_expense", label: "Operating Expense", types: ["expense"], normal: "debit" as const },
  { key: "non_operating_income", label: "Non Operating Income", types: ["other_income"], normal: "credit" as const },
  { key: "non_operating_expense", label: "Non Operating Expense", types: ["other_expense"], normal: "debit" as const }
];
const TYPE_TO_SECTION = new Map<string, (typeof SECTIONS)[number]>();
for (const s of SECTIONS) for (const t of s.types) TYPE_TO_SECTION.set(t, s);

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function pad(n: number) { return String(n).padStart(2, "0"); }

export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const sp = request.nextUrl.searchParams;
  const to = sp.get("to") || new Date().toISOString().slice(0, 10);
  const from = sp.get("from") || `${to.slice(0, 4)}-01-01`;
  const basis = sp.get("basis") === "cash" ? "cash" : "accrual";
  const filter = sp.get("filter") || "without_zero"; // without_zero | all | with_transactions

  try {
    const orgRows = (await prisma.$queryRaw`SELECT name, fiscal_year_start FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ name: string | null; fiscal_year_start: number | null }>;
    const company = orgRows[0]?.name ?? "Your Company";
    const startMonth = Number(orgRows[0]?.fiscal_year_start ?? 4) || 4;
    // Fiscal-year start on/before `to` (for the Year-To-Date column).
    const toYear = Number(to.slice(0, 4));
    const toMonth = Number(to.slice(5, 7));
    const fyStartYear = toMonth >= startMonth ? toYear : toYear - 1;
    const ytdFrom = `${fyStartYear}-${pad(startMonth)}-01`;

    // Period activity per account.
    const periodRows = (await prisma.$queryRaw`
      SELECT a.id, a.code, a.name, a.description, a.account_type,
             COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit, COUNT(jl.id)::int AS lines
      FROM accounts a
      LEFT JOIN (journal_entry_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id)
        ON jl.account_id = a.id AND je.status = 'posted'
        AND je.entry_date >= ${from}::date AND je.entry_date <= ${to}::date
      WHERE a.org_id = ${orgId}::uuid
        AND a.account_type IN ('revenue','cost_of_goods_sold','expense','other_income','other_expense')
      GROUP BY a.id, a.code, a.name, a.description, a.account_type
    `) as Array<{ id: string; code: string | null; name: string; description: string | null; account_type: string; debit: string; credit: string; lines: number }>;

    // Year-to-date activity per account.
    const ytdRows = (await prisma.$queryRaw`
      SELECT a.id, COALESCE(SUM(jl.debit),0) AS debit, COALESCE(SUM(jl.credit),0) AS credit
      FROM accounts a
      LEFT JOIN (journal_entry_lines jl JOIN journal_entries je ON je.id = jl.journal_entry_id)
        ON jl.account_id = a.id AND je.status = 'posted'
        AND je.entry_date >= ${ytdFrom}::date AND je.entry_date <= ${to}::date
      WHERE a.org_id = ${orgId}::uuid
        AND a.account_type IN ('revenue','cost_of_goods_sold','expense','other_income','other_expense')
      GROUP BY a.id
    `) as Array<{ id: string; debit: string; credit: string }>;
    const ytdById = new Map(ytdRows.map((r) => [r.id, { debit: Number(r.debit), credit: Number(r.credit) }]));

    const signed = (normal: "credit" | "debit", debit: number, credit: number) => round2(normal === "credit" ? credit - debit : debit - credit);

    const sectionMap = new Map(SECTIONS.map((s) => [s.key, { ...s, rows: [] as Array<Record<string, unknown>>, total: 0, ytdTotal: 0 }]));
    for (const r of periodRows) {
      const section = TYPE_TO_SECTION.get(r.account_type);
      if (!section) continue;
      const bucket = sectionMap.get(section.key)!;
      const amount = signed(section.normal, Number(r.debit), Number(r.credit));
      const ytd = ytdById.get(r.id);
      const ytdAmount = ytd ? signed(section.normal, ytd.debit, ytd.credit) : 0;
      bucket.total = round2(bucket.total + amount);
      bucket.ytdTotal = round2(bucket.ytdTotal + ytdAmount);
      const hasActivity = r.lines > 0;
      const include = filter === "all" ? true : filter === "with_transactions" ? hasActivity : amount !== 0;
      if (include) {
        bucket.rows.push({ account_id: r.id, code: r.code ?? "", name: r.name, description: r.description ?? "", amount, ytd: ytdAmount, has_activity: hasActivity });
      }
    }

    const sections = SECTIONS.map((s) => {
      const b = sectionMap.get(s.key)!;
      b.rows.sort((a, c) => String((a as { code: string }).code || (a as { name: string }).name).localeCompare(String((c as { code: string }).code || (c as { name: string }).name)));
      return { key: s.key, label: s.label, rows: b.rows, total: b.total, ytd_total: b.ytdTotal };
    });
    const get = (k: string) => sections.find((s) => s.key === k)!;
    const grossProfit = round2(get("operating_income").total - get("cogs").total);
    const grossProfitYtd = round2(get("operating_income").ytd_total - get("cogs").ytd_total);
    const operatingProfit = round2(grossProfit - get("operating_expense").total);
    const operatingProfitYtd = round2(grossProfitYtd - get("operating_expense").ytd_total);
    const netProfit = round2(operatingProfit + get("non_operating_income").total - get("non_operating_expense").total);
    const netProfitYtd = round2(operatingProfitYtd + get("non_operating_income").ytd_total - get("non_operating_expense").ytd_total);

    return ok({
      company, from, to, basis, filter,
      sections,
      grossProfit, grossProfitYtd,
      operatingProfit, operatingProfitYtd,
      netProfit, netProfitYtd
    });
  } catch (error) {
    return fail(500, { code: "REPORT_FAILED", message: errorMessage(error) });
  }
}
