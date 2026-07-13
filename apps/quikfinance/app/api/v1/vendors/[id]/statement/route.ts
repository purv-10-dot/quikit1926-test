import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
type Line = { date: string; type: string; number: string; details: string; debit: number; credit: number; balance: number };

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Vendor (accounts payable) statement. Credits = bills (amount we owe), debits =
 * payments made + vendor credits. Supports a date range and "outstanding only".
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
    if (!custRows.length) return fail(404, { code: "NOT_FOUND", message: "Vendor was not found." });

    if (outstanding) {
      const open = (await prisma.$queryRaw`
        SELECT bill_number, to_char(issue_date,'YYYY-MM-DD') AS d, balance_due FROM bills
        WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND balance_due > 0 AND issue_date <= ${to}::date
        ORDER BY issue_date ASC`) as Array<{ bill_number: string; d: string; balance_due: string }>;
      let bal = 0;
      const lines: Line[] = open.map((r) => { const amt = round2(Number(r.balance_due)); bal = round2(bal + amt); return { date: r.d, type: "Bill", number: r.bill_number, details: "Outstanding", debit: 0, credit: amt, balance: bal }; });
      return ok({ currency, from, to, outstanding, opening_balance: 0, lines, totals: { debit: 0, credit: bal }, closing_balance: bal, customer: { name: custRows[0].display_name, billing_address: custRows[0].billing_address } });
    }

    const sumBefore = async (table: string, col: string, dateCol: string, extra = "") =>
      Number(((await prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(${col}),0) AS s FROM ${table} WHERE org_id=$1::uuid AND contact_id=$2::uuid AND ${dateCol} < $3::date ${extra}`, orgId, id, from)) as Array<{ s: string }>)[0]?.s ?? 0);

    const openingBills = await sumBefore("bills", "total", "issue_date");
    const openingPayments = await sumBefore("payments", "amount", "payment_date", "AND payment_type='made'");
    const openingCredits = await sumBefore("vendor_credits", "total", "issue_date");
    const opening = round2(Number(custRows[0].opening_balance ?? 0) + openingBills - openingPayments - openingCredits);

    const bills = (await prisma.$queryRaw`SELECT 'Bill' AS type, bill_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amt, 'credit' AS side FROM bills WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND issue_date BETWEEN ${from}::date AND ${to}::date`) as Array<Record<string, unknown>>;
    const payments = (await prisma.$queryRaw`SELECT 'Payment Made' AS type, COALESCE(reference,'Payment') AS number, to_char(payment_date,'YYYY-MM-DD') AS date, amount AS amt, 'debit' AS side FROM payments WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND payment_type='made' AND payment_date BETWEEN ${from}::date AND ${to}::date`) as Array<Record<string, unknown>>;
    const credits = (await prisma.$queryRaw`SELECT 'Vendor Credit' AS type, vendor_credit_number AS number, to_char(issue_date,'YYYY-MM-DD') AS date, total AS amt, 'debit' AS side FROM vendor_credits WHERE org_id=${orgId}::uuid AND contact_id=${id}::uuid AND issue_date BETWEEN ${from}::date AND ${to}::date`) as Array<Record<string, unknown>>;

    const merged = [...bills, ...payments, ...credits].sort((a, b) => (String(a.date) < String(b.date) ? -1 : 1));
    let running = opening;
    let totalDebit = 0;
    let totalCredit = 0;
    const lines: Line[] = merged.map((r) => {
      const amt = round2(Number(r.amt));
      const debit = r.side === "debit" ? amt : 0;
      const credit = r.side === "credit" ? amt : 0;
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
      running = round2(running + credit - debit);
      return { date: String(r.date), type: String(r.type), number: String(r.number), details: "", debit, credit, balance: running };
    });

    return ok({ currency, from, to, outstanding: false, opening_balance: opening, lines, totals: { debit: totalDebit, credit: totalCredit }, closing_balance: running, customer: { name: custRows[0].display_name, billing_address: custRows[0].billing_address } });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}
