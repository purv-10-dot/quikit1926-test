import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const bucket = searchParams.get("bucket"); // overdue | due_soon | outstanding | all
  const contactId = searchParams.get("contact_id");
  const currency = searchParams.get("currency");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(100, Number(searchParams.get("limit") ?? 50));
  const offset = (page - 1) * limit;

  try {
    let query = db
      .from("invoices")
      .select(
        `id, invoice_number, issue_date, due_date, total, balance_due, status, currency,
         contacts!contact_id(id, display_name, email, phone)`,
        { count: "exact" }
      )
      .eq("org_id", orgId)
      .not("status", "in", '("draft","cancelled","void")')
      .gt("balance_due", 0)
      .order("due_date", { ascending: true })
      .range(offset, offset + limit - 1);

    if (contactId) query = query.eq("contact_id", contactId);
    if (currency) query = query.eq("currency", currency);

    if (bucket === "overdue") {
      query = query.lt("due_date", new Date().toISOString().split("T")[0]);
    } else if (bucket === "due_soon") {
      const today = new Date().toISOString().split("T")[0];
      const next7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      query = query.gte("due_date", today).lte("due_date", next7);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];
    const rows = (data ?? []).map((inv: Record<string, unknown>) => {
      const due = inv.due_date as string;
      const daysOverdue = due < today ? Math.floor((Date.now() - new Date(due).getTime()) / 86400000) : 0;
      const agingBucket =
        daysOverdue > 0 ? "overdue"
        : due <= new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0] ? "due_soon"
        : "outstanding";
      return { ...inv, days_overdue: daysOverdue, aging_bucket: agingBucket };
    });

    const summary = {
      total_outstanding: rows.reduce((s: number, r) => s + Number((r as Record<string, unknown>).balance_due ?? 0), 0),
      overdue_count: rows.filter((r) => (r as Record<string, unknown>).aging_bucket === "overdue").length,
      due_soon_count: rows.filter((r) => (r as Record<string, unknown>).aging_bucket === "due_soon").length
    };

    return ok(rows, { total: count ?? 0, page, limit, summary });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
