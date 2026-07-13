import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { round2 } from "@/lib/accounting/posting";
import { nextDocumentNumber } from "@/lib/accounting/numbering";
import { todayISO, addDaysISO } from "@/lib/utils/dates";
import { loadQuoteSettings } from "@/lib/settings/quote";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

type QuoteRow = { contact_id: string; currency: string; subtotal: string; tax_total: string; total: string; notes: string | null; terms: string | null; status: string };
type LineRow = { item_id: string | null; account_id: string | null; description: string; quantity: string; rate: string; discount: string; item_name: string | null };

/**
 * Convert a quote into an invoice (carrying its line items) or a sales order
 * (header-level — sales orders are header-only throughout this app). The source
 * quote is marked converted so it isn't actioned twice.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;

  let body: { target?: string } = {};
  try { body = (await request.json()) as { target?: string }; } catch { body = {}; }
  const target = body.target === "sales_order" ? "sales_order" : "invoice";

  try {
    const quotes = (await prisma.$queryRaw`
      SELECT contact_id, currency, subtotal, tax_total, total, notes, terms, status
      FROM quotations WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1
    `) as QuoteRow[];
    if (!quotes.length) return fail(404, { code: "NOT_FOUND", message: "Quote was not found." });
    const quote = quotes[0];

    // Honor "fields to retain when converting" (Settings → Quotes).
    const settings = await loadQuoteSettings(prisma, orgId);
    const keepNotes = settings.retain_customer_notes ? quote.notes : null;
    const keepTerms = settings.retain_terms ? quote.terms : null;

    const lines = (await prisma.$queryRaw`
      SELECT ql.item_id, ql.account_id, ql.description, ql.quantity, ql.rate, ql.discount, i.name AS item_name
      FROM quotation_lines ql LEFT JOIN items i ON i.id = ql.item_id
      WHERE ql.quotation_id = ${params.id}::uuid AND ql.org_id = ${orgId}::uuid ORDER BY ql.display_order ASC
    `) as LineRow[];

    if (target === "invoice") {
      const lineItems = lines
        .map((l) => ({
          description: (l.description?.trim() || l.item_name || "Item").slice(0, 500),
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          discount: Number(l.discount ?? 0),
          item_id: l.item_id ?? null,
          account_id: l.account_id ?? null
        }))
        .filter((l) => l.quantity > 0);
      if (lineItems.length === 0) return fail(400, { code: "NO_LINES", message: "This quote has no line items to invoice." });

      const parsed = invoiceSchema.safeParse({
        contact_id: quote.contact_id,
        issue_date: todayISO(),
        due_date: addDaysISO(30),
        status: "draft",
        currency: quote.currency?.trim() || "INR",
        subtotal: round2(Number(quote.subtotal ?? 0)),
        total: round2(Number(quote.total ?? 0)),
        balance_due: round2(Number(quote.total ?? 0)),
        notes: keepNotes,
        terms: keepTerms ? keepTerms.slice(0, 1000) : null,
        line_items: lineItems
      });
      if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Could not build an invoice from this quote.", details: parsed.error.flatten() });

      const result = await prisma.$transaction(async (tx) => {
        const inv = await saveInvoice(tx, orgId, userId, parsed.data);
        await tx.$executeRaw`UPDATE quotations SET status = 'invoiced', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
        return inv;
      });
      const rows = (await prisma.$queryRaw`SELECT invoice_number FROM invoices WHERE id = ${result.id}::uuid`) as Array<{ invoice_number: string }>;
      await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "quotation", entity_id: params.id, action: "convert", new_values: { to: "invoice", invoice_id: result.id } });
      return ok({ id: result.id, target, number: rows[0]?.invoice_number ?? null, redirect: `/invoices/${result.id}` }, undefined, { status: 201 });
    }

    // Sales order (header-only).
    const result = await prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, orgId, "sales_order", { locationId: null });
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO sales_orders (org_id, contact_id, sales_order_number, status, issue_date, due_date, currency, subtotal, tax_total, total, notes, created_by)
        VALUES (${orgId}::uuid, ${quote.contact_id}::uuid, ${number}, 'draft', ${todayISO()}::date, ${addDaysISO(30)}::date,
          ${quote.currency?.trim() || "INR"}, ${round2(Number(quote.subtotal ?? 0))}, ${round2(Number(quote.tax_total ?? 0))},
          ${round2(Number(quote.total ?? 0))}, ${keepNotes ?? null}, ${userId ? userId : null}::uuid)
        RETURNING id`;
      await tx.$executeRaw`UPDATE quotations SET status = 'accepted', updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { id: rows[0].id, number };
    });
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "quotation", entity_id: params.id, action: "convert", new_values: { to: "sales_order", sales_order_id: result.id } });
    return ok({ id: result.id, target, number: result.number, redirect: `/sales-orders/${result.id}` }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CONVERT_FAILED", message: errorMessage(error) });
  }
}
