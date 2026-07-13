import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? new Date(new Date().getFullYear(), 3, 1).toISOString().split("T")[0];
  const to = searchParams.get("to") ?? new Date().toISOString().split("T")[0];
  const contactId = searchParams.get("contact_id");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(500, Number(searchParams.get("limit") ?? 100));
  const offset = (page - 1) * limit;

  try {
    let query = db
      .from("bills")
      .select(
        `id, bill_number, issue_date, due_date, subtotal, tax_total, tds_amount, total, balance_due, status, currency,
         contacts!contact_id(id, display_name, tax_id, state_code)`,
        { count: "exact" }
      )
      .eq("org_id", orgId)
      .not("status", "in", '("draft","cancelled")')
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("issue_date", { ascending: false })
      .range(offset, offset + limit - 1);

    if (contactId) query = query.eq("contact_id", contactId);

    const { data, count, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const summary = {
      total_taxable: rows.reduce((s, r) => s + Number(r.subtotal ?? 0), 0),
      total_tax: rows.reduce((s, r) => s + Number(r.tax_total ?? 0), 0),
      total_tds: rows.reduce((s, r) => s + Number((r as Record<string, unknown>).tds_amount ?? 0), 0),
      total_billed: rows.reduce((s, r) => s + Number(r.total ?? 0), 0),
      total_outstanding: rows.reduce((s, r) => s + Number(r.balance_due ?? 0), 0),
      bill_count: rows.length
    };

    return ok(rows, { total: count ?? 0, page, limit, period: { from, to }, summary });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
