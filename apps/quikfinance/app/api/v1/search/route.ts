import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

export type SearchResult = { type: string; id: string; label: string; sublabel: string; href: string };

/** Global search across the main records — powers the top-bar / command-palette search. */
export async function GET(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return ok({ results: [] as SearchResult[] });
  const like = `%${q}%`;

  try {
    type Num = { id: string; num: string };
    const [invoices, contacts, bills, quotes, pos, salesOrders, creditNotes, vendorCredits, payments, expenses, items] = await Promise.all([
      prisma.$queryRaw`
        SELECT i.id, i.invoice_number AS num, c.display_name AS party
        FROM invoices i LEFT JOIN contacts c ON c.id = i.contact_id
        WHERE i.org_id = ${orgId}::uuid AND (i.invoice_number ILIKE ${like} OR c.display_name ILIKE ${like})
        ORDER BY i.created_at DESC LIMIT 6` as Promise<Array<{ id: string; num: string; party: string | null }>>,
      prisma.$queryRaw`
        SELECT id, display_name, customer_code, type, email
        FROM contacts WHERE org_id = ${orgId}::uuid AND (display_name ILIKE ${like} OR customer_code ILIKE ${like} OR email ILIKE ${like})
        ORDER BY display_name LIMIT 6` as Promise<Array<{ id: string; display_name: string; customer_code: string | null; type: string; email: string | null }>>,
      prisma.$queryRaw`
        SELECT b.id, b.bill_number AS num, c.display_name AS party
        FROM bills b LEFT JOIN contacts c ON c.id = b.contact_id
        WHERE b.org_id = ${orgId}::uuid AND (b.bill_number ILIKE ${like} OR c.display_name ILIKE ${like})
        ORDER BY b.created_at DESC LIMIT 5` as Promise<Array<{ id: string; num: string; party: string | null }>>,
      prisma.$queryRaw`SELECT id, quotation_number AS num FROM quotations WHERE org_id = ${orgId}::uuid AND quotation_number ILIKE ${like} ORDER BY created_at DESC LIMIT 5` as Promise<Num[]>,
      prisma.$queryRaw`SELECT id, purchase_order_number AS num FROM purchase_orders WHERE org_id = ${orgId}::uuid AND purchase_order_number ILIKE ${like} ORDER BY created_at DESC LIMIT 5` as Promise<Num[]>,
      prisma.$queryRaw`SELECT id, sales_order_number AS num FROM sales_orders WHERE org_id = ${orgId}::uuid AND (sales_order_number ILIKE ${like} OR reference_number ILIKE ${like}) ORDER BY created_at DESC LIMIT 5` as Promise<Num[]>,
      prisma.$queryRaw`SELECT id, credit_note_number AS num FROM credit_notes WHERE org_id = ${orgId}::uuid AND credit_note_number ILIKE ${like} ORDER BY created_at DESC LIMIT 4` as Promise<Num[]>,
      prisma.$queryRaw`SELECT id, vendor_credit_number AS num FROM vendor_credits WHERE org_id = ${orgId}::uuid AND vendor_credit_number ILIKE ${like} ORDER BY created_at DESC LIMIT 4` as Promise<Num[]>,
      prisma.$queryRaw`SELECT id, payment_number AS num, payment_type, reference FROM payments WHERE org_id = ${orgId}::uuid AND (payment_number ILIKE ${like} OR reference ILIKE ${like}) ORDER BY created_at DESC LIMIT 5` as Promise<Array<{ id: string; num: string | null; payment_type: string; reference: string | null }>>,
      prisma.$queryRaw`SELECT id, description, reference, employee_name FROM expenses WHERE org_id = ${orgId}::uuid AND (description ILIKE ${like} OR reference ILIKE ${like} OR employee_name ILIKE ${like}) ORDER BY created_at DESC LIMIT 5` as Promise<Array<{ id: string; description: string | null; reference: string | null; employee_name: string | null }>>,
      prisma.$queryRaw`SELECT id, name, sku FROM items WHERE org_id = ${orgId}::uuid AND (name ILIKE ${like} OR sku ILIKE ${like}) ORDER BY name LIMIT 6` as Promise<Array<{ id: string; name: string; sku: string | null }>>
    ]);

    const results: SearchResult[] = [
      ...invoices.map((r) => ({ type: "Invoices", id: r.id, label: r.num, sublabel: r.party ?? "", href: `/invoices/${r.id}` })),
      ...contacts.map((r) => ({ type: r.type === "vendor" ? "Vendors" : "Customers", id: r.id, label: r.display_name, sublabel: r.customer_code || r.email || "", href: `${r.type === "vendor" ? "/vendors" : "/customers"}/${r.id}` })),
      ...bills.map((r) => ({ type: "Bills", id: r.id, label: r.num, sublabel: r.party ?? "", href: `/bills/${r.id}` })),
      ...quotes.map((r) => ({ type: "Quotes", id: r.id, label: r.num, sublabel: "", href: `/quotations/${r.id}` })),
      ...salesOrders.map((r) => ({ type: "Sales Orders", id: r.id, label: r.num, sublabel: "", href: `/sales-orders/${r.id}` })),
      ...pos.map((r) => ({ type: "Purchase Orders", id: r.id, label: r.num, sublabel: "", href: `/purchase-orders/${r.id}` })),
      ...creditNotes.map((r) => ({ type: "Credit Notes", id: r.id, label: r.num, sublabel: "", href: `/credit-notes/${r.id}` })),
      ...vendorCredits.map((r) => ({ type: "Vendor Credits", id: r.id, label: r.num, sublabel: "", href: `/vendor-credits/${r.id}` })),
      ...payments.map((r) => ({ type: "Payments", id: r.id, label: r.num || r.reference || "Payment", sublabel: r.payment_type === "made" ? "Paid" : "Received", href: `/payments/${r.payment_type === "made" ? "made" : "received"}/${r.id}` })),
      ...expenses.map((r) => ({ type: "Expenses", id: r.id, label: r.description || r.reference || "Expense", sublabel: r.employee_name ?? "", href: `/expenses/${r.id}` })),
      ...items.map((r) => ({ type: "Items", id: r.id, label: r.name, sublabel: r.sku ?? "", href: `/inventory/${r.id}` }))
    ];
    return ok({ results });
  } catch (error) {
    return fail(500, { code: "SEARCH_FAILED", message: errorMessage(error) });
  }
}
