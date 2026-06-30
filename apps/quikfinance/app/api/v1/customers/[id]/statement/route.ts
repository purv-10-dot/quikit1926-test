import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type Line = { date: string; type: string; number: string; details: string; debit: number; credit: number; balance: number };

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Customer account statement. Debits = invoices (amount owed), credits =
 * payments received + credit notes. Supports a date range, an "outstanding only"
 * view, and an optional location (where transactions are tagged to one).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  const id = params.id;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") || "1900-01-01";
  const to = searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const outstanding = searchParams.get("outstanding") === "true";

  try {
    const orgRows = (await prisma.$queryRaw`SELECT base_currency FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ base_currency: string }>;
    const currency = orgRows[0]?.base_currency ?? "INR";
    const custRows = (await prisma.$queryRaw`SELECT display_name, opening_balance, billing_address FROM contacts WHERE id = ${id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<Record<string, unknown>>;
    if (!custRows.length) return fail(404, { code: "NOT_FOUND", message: "Customer was not found." });

    if (outstanding) {
      // Outstanding view: open invoices only (amount = balance due).
      const open = (await prisma.$queryRaw`
        SELECT invoice_number, to_char(issue_date,'YYYY-MM-DD') AS d, balance_due FROM invoices
        WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND balance_due > 0 AND issue_date <= ${to}::date
        ORDER BY issue_date ASC`) as Array<{ invoice_number: string; d: string; balance_due: string }>;
      let bal = 0;
      const lines: Line[] = open.map((r) => { const amt = round2(Number(r.balance_due)); bal = round2(bal + amt); return { date: r.d, type: "Invoice", number: r.invoice_number, details: "Outstanding", debit: amt, credit: 0, balance: bal }; });
      return ok({ currency, from, to, outstanding, opening_balance: 0, lines, totals: { debit: bal, credit: 0 }, closing_balance: bal, customer: { name: custRows[0].display_name, billing_address: custRows[0].billing_address } });
    }

    const sumBefore = async (table: string, col: string, dateCol: string) =>
      Number(((await prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(${col}),0) AS s FROM ${table} WHERE org_id=$1::uuid AND contact_id=$2::uuid AND ${dateCol} < $3::date`, orgId, id, from)) as Array<{ s: string }>)[0]?.s ?? 0);

    const openingInvoices = await sumBefore("invoices", "total", "issue_date");
    const openingPayments = await sumBefore("payments", "amount", "payment_date"); // received filter below
    const openingPaymentsRecv = Number(((await prisma.$queryRaw`SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND payment_type='received' AND payment_date < ${from}::date`) as Array<{ s: string }>)[0]?.s ?? 0);
    const openingCredits = await sumBefore("credit_notes", "total", "issue_date");
    void openingPayments;
    const opening = round2(Number(custRows[0].opening_balance ?? 0) + openingInvoices - openingPaymentsRecv - openingCredits);

    const invoices = (await prisma.$queryRaw`SELECT 'Invoice' AS type, invoice_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amt, 'debit' AS side FROM invoices WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND issue_date BETWEEN ${from}::date AND ${to}::date`) as Array<Record<string, unknown>>;
    const payments = (await prisma.$queryRaw`SELECT 'Payment' AS type, COALESCE(reference,'Payment') AS number, to_char(payment_date,'YYYY-MM-DD') AS date, amount AS amt, 'credit' AS side FROM payments WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND payment_type='received' AND payment_date BETWEEN ${from}::date AND ${to}::date`) as Array<Record<string, unknown>>;
    const credits = (await prisma.$queryRaw`SELECT 'Credit Note' AS type, credit_note_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amt, 'credit' AS side FROM credit_notes WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND issue_date BETWEEN ${from}::date AND ${to}::date`) as Array<Record<string, unknown>>;

    const merged = [...invoices, ...payments, ...credits].sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const lines: Line[] = merged.map((r) => {
      const amt = round2(Number(r.amt));
      const debit = r.side === "debit" ? amt : 0;
      const credit = r.side === "credit" ? amt : 0;
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
      running = round2(running + debit - credit);
      return { date: String(r.date), type: String(r.type), number: String(r.number), details: "", debit, credit, balance: running };
    });

    return ok({ currency, from, to, outstanding: false, opening_balance: opening, lines, totals: { debit: totalDebit, credit: totalCredit }, closing_balance: running, customer: { name: custRows[0].display_name, billing_address: custRows[0].billing_address } });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}
