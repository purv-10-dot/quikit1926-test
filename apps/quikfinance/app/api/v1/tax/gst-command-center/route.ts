import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, prisma, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const month = Number(searchParams.get("month") ?? new Date().getMonth() + 1);
  const year = Number(searchParams.get("year") ?? new Date().getFullYear());

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().split("T")[0];

  type SumRow = { tax: number | string | null; total: number | string | null };

  try {
    const [invoiceAgg, billAgg, expensesRes, returnsRes] = await Promise.all([
      prisma.$queryRaw<SumRow[]>`
        SELECT COALESCE(SUM(il.tax_amount), 0) AS tax, COALESCE(SUM(il.line_total), 0) AS total
        FROM invoice_lines il
        JOIN invoices i ON i.id = il.invoice_id
        WHERE i.org_id = ${orgId}::uuid
          AND i.issue_date >= ${startDate}::date
          AND i.issue_date <= ${endDate}::date
          AND i.status <> 'draft' AND i.status <> 'cancelled'`,
      prisma.$queryRaw<SumRow[]>`
        SELECT COALESCE(SUM(bl.tax_amount), 0) AS tax, COALESCE(SUM(bl.line_total), 0) AS total
        FROM bill_lines bl
        JOIN bills b ON b.id = bl.bill_id
        WHERE b.org_id = ${orgId}::uuid
          AND b.issue_date >= ${startDate}::date
          AND b.issue_date <= ${endDate}::date
          AND b.status <> 'draft'`,
      db
        .from("expenses")
        .select("amount, tax_amount")
        .eq("org_id", orgId)
        .gte("date", startDate)
        .lte("date", endDate),
      db
        .from("gst_returns")
        .select("*")
        .eq("org_id", orgId)
        .eq("period_month", month)
        .eq("period_year", year)
    ]);

    const outputGst = Number(invoiceAgg[0]?.tax ?? 0);
    const taxableSales = Number(invoiceAgg[0]?.total ?? 0);
    const inputGstBills = Number(billAgg[0]?.tax ?? 0);
    const taxablePurchases = Number(billAgg[0]?.total ?? 0);
    const inputGstExpenses = (expensesRes.data ?? []).reduce((s: number, l: Record<string, unknown>) => s + Number(l.tax_amount ?? 0), 0);
    const inputGst = inputGstBills + inputGstExpenses;
    const netPayable = Math.max(0, outputGst - inputGst);

    const returns = (returnsRes.data ?? []) as Array<Record<string, any>>;
    const gstr1 = returns.find((r) => r.return_type === "gstr1") ?? null;
    const gstr3b = returns.find((r) => r.return_type === "gstr3b") ?? null;
    const gstr2b = returns.find((r) => r.return_type === "gstr2b") ?? null;

    return ok({
      period: { month, year, start_date: startDate, end_date: endDate },
      summary: {
        output_gst: outputGst,
        input_gst: inputGst,
        net_payable: netPayable,
        taxable_sales: taxableSales,
        taxable_purchases: taxablePurchases
      },
      returns: { gstr1, gstr3b, gstr2b },
      status: {
        gstr1_filed: !!gstr1?.filed_at,
        gstr3b_filed: !!gstr3b?.filed_at,
        gstr2b_available: !!gstr2b
      }
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
