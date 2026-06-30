import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().split("T")[0];

  try {
    const [jeRes, invRes, billRes, payRes, expRes] = await Promise.all([
      db
        .from("journal_entries")
        .select(`id, date, reference, memo, status, journal_entry_lines(id, account_id, debit, credit, memo, accounts!account_id(code, name))`)
        .eq("org_id", orgId)
        .eq("date", date)
        .eq("status", "posted"),
      db
        .from("invoices")
        .select(`id, invoice_number, total, status, contacts!contact_id(display_name)`)
        .eq("org_id", orgId)
        .eq("issue_date", date)
        .neq("status", "draft"),
      db
        .from("bills")
        .select(`id, bill_number, total, status, contacts!contact_id(display_name)`)
        .eq("org_id", orgId)
        .eq("issue_date", date)
        .neq("status", "draft"),
      db
        .from("payments")
        .select(`id, type, amount, method, status, contacts!contact_id(display_name)`)
        .eq("org_id", orgId)
        .eq("date", date),
      db
        .from("expenses")
        .select(`id, amount, description, category`)
        .eq("org_id", orgId)
        .eq("date", date)
    ]);

    const journalEntries = jeRes.data ?? [];
    const journalLines = journalEntries.flatMap((je) => (je.journal_entry_lines as unknown[]) ?? []);
    const totalDebits = journalLines.reduce<number>((s, l) => s + Number((l as Record<string, unknown>).debit ?? 0), 0);
    const totalCredits = journalLines.reduce<number>((s, l) => s + Number((l as Record<string, unknown>).credit ?? 0), 0);

    return ok({
      date,
      journal_entries: journalEntries,
      invoices: invRes.data ?? [],
      bills: billRes.data ?? [],
      payments: payRes.data ?? [],
      expenses: expRes.data ?? [],
      summary: {
        total_debits: totalDebits,
        total_credits: totalCredits,
        invoice_count: (invRes.data ?? []).length,
        bill_count: (billRes.data ?? []).length,
        payment_count: (payRes.data ?? []).length
      }
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
