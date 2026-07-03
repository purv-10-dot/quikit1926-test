import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contact_id");
  if (!contactId) return fail(400, { code: "MISSING_PARAM", message: "contact_id is required." });

  const from = searchParams.get("from") ?? new Date(new Date().getFullYear(), 3, 1).toISOString().split("T")[0];
  const to = searchParams.get("to") ?? new Date().toISOString().split("T")[0];

  try {
    const [contactRes, billsRes, paymentsRes] = await Promise.all([
      db.from("contacts").select("*").eq("id", contactId).eq("org_id", orgId).single(),
      db
        .from("bills")
        .select(`id, bill_number, issue_date, due_date, total, balance_due, status, currency`)
        .eq("org_id", orgId)
        .eq("contact_id", contactId)
        .gte("issue_date", from)
        .lte("issue_date", to)
        .order("issue_date"),
      db
        .from("payments")
        .select(`id, date, amount, method, reference`)
        .eq("org_id", orgId)
        .eq("contact_id", contactId)
        .eq("type", "made")
        .gte("date", from)
        .lte("date", to)
        .order("date")
    ]);

    if (!contactRes.data) return fail(404, { code: "NOT_FOUND", message: "Contact not found." });

    const bills = billsRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    const transactions = [
      ...bills.map((b) => ({
        type: "bill" as const,
        date: b.issue_date,
        reference: b.bill_number,
        due_date: b.due_date,
        debit: 0,
        credit: Number(b.total),
        balance: Number(b.balance_due),
        status: b.status
      })),
      ...payments.map((p) => ({
        type: "payment" as const,
        date: p.date,
        reference: p.reference,
        due_date: null,
        debit: Number(p.amount),
        credit: 0,
        balance: 0,
        status: "paid"
      }))
    ].sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    const withBalance = transactions.map((t) => {
      runningBalance += t.credit - t.debit;
      return { ...t, running_balance: runningBalance };
    });

    return ok({
      contact: contactRes.data,
      period: { from, to },
      transactions: withBalance,
      summary: {
        total_billed: bills.reduce((s, b) => s + Number(b.total), 0),
        total_paid: payments.reduce((s, p) => s + Number(p.amount), 0),
        total_outstanding: bills.reduce((s, b) => s + Number(b.balance_due), 0)
      }
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
