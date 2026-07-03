import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { budgetSchema } from "@/lib/validations/operations.schema";
import { saveBudget, periodSlots } from "@/lib/accounting/budget-service";
import { accountTypeMeta } from "@/lib/constants/account-types";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function pad(n: number) { return String(n).padStart(2, "0"); }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const budgetRows = (await prisma.$queryRaw`
      SELECT b.*, d.name AS department_name, d.type AS department_type, w.name AS location_name
      FROM budgets b
      LEFT JOIN departments d ON d.id = b.department_id
      LEFT JOIN warehouses w ON w.id = b.location_id
      WHERE b.id = ${params.id}::uuid AND b.org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!budgetRows.length) return fail(404, { code: "NOT_FOUND", message: "Budget was not found." });
    const budget = budgetRows[0];
    const period = String(budget.period ?? "monthly");
    const slots = periodSlots(period);
    const fiscalYear = Number(budget.fiscal_year);

    // Fiscal window from the org's fiscal-year start month (default April).
    const orgRows = (await prisma.$queryRaw`SELECT fiscal_year_start FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ fiscal_year_start: number | null }>;
    const startMonth = Number(orgRows[0]?.fiscal_year_start ?? 4) || 4;
    const fyStart = `${fiscalYear}-${pad(startMonth)}-01`;
    const fyEnd = `${fiscalYear + 1}-${pad(startMonth)}-01`;

    // Department subtree for actuals: a division rolls up its child departments.
    const deptId = budget.department_id ? String(budget.department_id) : null;
    let deptIds: Set<string> | null = null;
    let children: Array<Record<string, unknown>> = [];
    if (deptId) {
      children = (await prisma.$queryRaw`SELECT id, name FROM departments WHERE org_id = ${orgId}::uuid AND parent_id = ${deptId}::uuid`) as Array<Record<string, unknown>>;
      deptIds = new Set<string>([deptId, ...children.map((c) => String(c.id))]);
    }

    // Budget lines + the budgeted accounts' metadata.
    const lineRows = (await prisma.$queryRaw`
      SELECT bl.account_id, bl.month, bl.amount, a.name AS account_name, a.code AS account_code, a.account_type
      FROM budget_lines bl LEFT JOIN accounts a ON a.id = bl.account_id
      WHERE bl.budget_id = ${params.id}::uuid AND bl.org_id = ${orgId}::uuid
      ORDER BY a.account_type, a.code
    `) as Array<{ account_id: string; month: number; amount: string; account_name: string; account_code: string | null; account_type: string }>;

    // Actuals: posted journal lines in the fiscal window (filtered to budgeted accounts + dept subtree in JS).
    const budgetedAccountIds = new Set(lineRows.map((l) => l.account_id));
    const actualRows = budgetedAccountIds.size
      ? ((await prisma.$queryRaw`
          SELECT l.account_id, je.department_id, to_char(je.entry_date,'YYYY-MM') AS ym, l.debit, l.credit
          FROM journal_entry_lines l JOIN journal_entries je ON je.id = l.journal_entry_id
          WHERE je.org_id = ${orgId}::uuid AND je.status = 'posted'
            AND je.entry_date >= ${fyStart}::date AND je.entry_date < ${fyEnd}::date
        `) as Array<{ account_id: string; department_id: string | null; ym: string; debit: string; credit: string }>)
      : [];

    const slotFor = (ym: string): number => {
      const [yy, mm] = ym.split("-").map(Number);
      const monthsSince = (yy - fiscalYear) * 12 + (mm - startMonth);
      if (monthsSince < 0 || monthsSince >= 12) return -1;
      return period === "yearly" ? 0 : period === "quarterly" ? Math.floor(monthsSince / 3) : monthsSince;
    };

    type Acc = { account_id: string; account_name: string; account_code: string | null; account_type: string; group: string; budget_slots: number[]; actual_slots: number[] };
    const byAccount = new Map<string, Acc>();
    const ensure = (id: string, name: string, code: string | null, type: string): Acc => {
      let a = byAccount.get(id);
      if (!a) {
        a = { account_id: id, account_name: name, account_code: code, account_type: type, group: accountTypeMeta(type)?.group ?? "Other", budget_slots: Array(slots).fill(0), actual_slots: Array(slots).fill(0) };
        byAccount.set(id, a);
      }
      return a;
    };
    for (const l of lineRows) {
      const a = ensure(l.account_id, l.account_name, l.account_code, l.account_type);
      const slot = Math.min(Math.max(Number(l.month) - 1, 0), slots - 1);
      a.budget_slots[slot] = round2(a.budget_slots[slot] + Number(l.amount));
    }
    for (const r of actualRows) {
      if (!budgetedAccountIds.has(r.account_id)) continue;
      if (deptIds && !(r.department_id && deptIds.has(r.department_id))) continue;
      const a = byAccount.get(r.account_id);
      if (!a) continue;
      const slot = slotFor(r.ym);
      if (slot < 0) continue;
      const net = Number(r.debit) - Number(r.credit);
      const signed = accountTypeMeta(a.account_type)?.normalBalance === "credit" ? -net : net;
      a.actual_slots[slot] = round2(a.actual_slots[slot] + signed);
    }

    const accounts = Array.from(byAccount.values()).map((a) => {
      const budgeted = round2(a.budget_slots.reduce((s, n) => s + n, 0));
      const actual = round2(a.actual_slots.reduce((s, n) => s + n, 0));
      return { ...a, budgeted, actual, variance: round2(budgeted - actual), variance_pct: budgeted ? round2(((budgeted - actual) / Math.abs(budgeted)) * 100) : null };
    });

    const groupTotal = (g: string, key: "budgeted" | "actual") => round2(accounts.filter((a) => a.group === g).reduce((s, a) => s + a[key], 0));
    const totals = {
      income_budget: groupTotal("Income", "budgeted"), income_actual: groupTotal("Income", "actual"),
      expense_budget: groupTotal("Expense", "budgeted"), expense_actual: groupTotal("Expense", "actual")
    };

    return ok({ ...budget, period, slots, fiscal_year: fiscalYear, fy_start: fyStart, fy_end: fyEnd, rolls_up: children.map((c) => String(c.name)), accounts, totals });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = budgetSchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "The budget is invalid.", details: parsed.error.flatten() });

  try {
    const exists = (await prisma.$queryRaw`SELECT id FROM budgets WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as unknown[];
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Budget was not found." });
    await prisma.$transaction((tx) => saveBudget(tx, orgId, parsed.data, params.id));
    const rows = (await prisma.$queryRaw`SELECT * FROM budgets WHERE id = ${params.id}::uuid`) as unknown[];
    return ok(rows[0]);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM budget_lines WHERE budget_id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      await tx.$executeRaw`DELETE FROM budgets WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id });
  } catch (error) {
    return fail(400, { code: "DELETE_FAILED", message: errorMessage(error) });
  }
}
