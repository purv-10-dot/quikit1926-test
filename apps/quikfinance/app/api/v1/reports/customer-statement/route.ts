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
    const [contactRes, invoicesRes, paymentsRes] = await Promise.all([
      db.from("contacts").select("*").eq("id", contactId).eq("org_id", orgId).single(),
      db
        .from("invoices")
        .select(`id, invoice_number, issue_date, due_date, total, balance_due, status, currency`)
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
        .eq("type", "received")
        .gte("date", from)
        .lte("date", to)
        .order("date")
    ]);

    if (!contactRes.data) return fail(404, { code: "NOT_FOUND", message: "Contact not found." });

    const invoices = invoicesRes.data ?? [];
    const payments = paymentsRes.data ?? [];

    const transactions = [
      ...invoices.map((inv) => ({
        type: "invoice" as const,
        date: inv.issue_date,
        reference: inv.invoice_number,
        due_date: inv.due_date,
        debit: Number(inv.total),
        credit: 0,
        balance: Number(inv.balance_due),
        status: inv.status
      })),
      ...payments.map((p) => ({
        type: "payment" as const,
        date: p.date,
        reference: p.reference,
        due_date: null,
        debit: 0,
        credit: Number(p.amount),
        balance: 0,
        status: "paid"
      }))
    ].sort((a, b) => a.date.localeCompare(b.date));

    let runningBalance = 0;
    const withBalance = transactions.map((t) => {
      runningBalance += t.debit - t.credit;
      return { ...t, running_balance: runningBalance };
    });

    const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total), 0);
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalOutstanding = invoices.reduce((s, i) => s + Number(i.balance_due), 0);

    return ok({
      contact: contactRes.data,
      period: { from, to },
      transactions: withBalance,
      summary: { total_invoiced: totalInvoiced, total_paid: totalPaid, total_outstanding: totalOutstanding }
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
