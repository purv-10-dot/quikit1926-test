import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("project_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  try {
    let projectsQuery = db
      .from("projects")
      .select(`id, name, status, budget, billing_method, start_date, end_date, contacts!contact_id(display_name)`)
      .eq("org_id", orgId)
      .order("name");

    if (projectId) projectsQuery = projectsQuery.eq("id", projectId);

    const { data: projects, error: projErr } = await projectsQuery;
    if (projErr) throw projErr;

    const projectIds = (projects ?? []).map((p) => p.id);
    if (projectIds.length === 0) return ok([]);

    let timeQuery = db
      .from("time_entries")
      .select(`project_id, hours, rate, is_billable, is_billed, work_date`)
      .in("project_id", projectIds)
      .eq("org_id", orgId);

    if (from) timeQuery = timeQuery.gte("work_date", from);
    if (to) timeQuery = timeQuery.lte("work_date", to);

    const { data: timeEntries } = await timeQuery;
    const { data: invoices } = await db
      .from("invoices")
      .select("project_id, total, balance_due, status")
      .in("project_id", projectIds)
      .eq("org_id", orgId)
      .neq("status", "draft");

    const { data: expenses } = await db
      .from("expenses")
      .select("project_id, amount")
      .in("project_id", projectIds)
      .eq("org_id", orgId);

    const rows = (projects ?? []).map((project) => {
      const pId = project.id;
      const pTime = (timeEntries ?? []).filter((t) => t.project_id === pId);
      const pInv = (invoices ?? []).filter((i) => (i as Record<string, unknown>).project_id === pId);
      const pExp = (expenses ?? []).filter((e) => (e as Record<string, unknown>).project_id === pId);

      const totalHours = pTime.reduce((s, t) => s + Number(t.hours), 0);
      const billableHours = pTime.filter((t) => t.is_billable).reduce((s, t) => s + Number(t.hours), 0);
      const laborCost = pTime.reduce((s, t) => s + Number(t.hours) * Number(t.rate), 0);
      const expenseCost = pExp.reduce((s, e) => s + Number((e as Record<string, unknown>).amount ?? 0), 0);
      const totalRevenue = pInv.reduce((s, i) => s + Number(i.total), 0);
      const totalCost = laborCost + expenseCost;

      return {
        project_id: pId,
        project_name: project.name,
        status: project.status,
        budget: project.budget,
        customer: ((project.contacts as unknown) as Record<string, unknown>)?.display_name ?? null,
        total_hours: totalHours,
        billable_hours: billableHours,
        labor_cost: laborCost,
        expense_cost: expenseCost,
        total_cost: totalCost,
        total_revenue: totalRevenue,
        gross_profit: totalRevenue - totalCost,
        margin_pct: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : null,
        budget_utilization: project.budget > 0 ? (totalCost / project.budget) * 100 : null
      };
    });

    return ok(rows, {
      summary: {
        total_revenue: rows.reduce((s, r) => s + r.total_revenue, 0),
        total_cost: rows.reduce((s, r) => s + r.total_cost, 0),
        total_profit: rows.reduce((s, r) => s + r.gross_profit, 0),
        total_hours: rows.reduce((s, r) => s + r.total_hours, 0)
      }
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
