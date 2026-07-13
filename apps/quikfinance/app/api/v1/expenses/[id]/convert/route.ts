import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { invoiceSchema } from "@/lib/validations/invoice.schema";
import { saveInvoice } from "@/lib/accounting/invoice-service";
import { loadInvoiceSettings } from "@/lib/settings/invoice";
import { nextDocumentNumber } from "@/lib/accounting/numbering";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/**
 * Bill a reimbursable expense to its customer: creates a draft customer invoice
 * (Dr A/R / Cr Revenue when posted) for the expense amount and marks the expense
 * billed + linked. The accounting association between Expenses and Invoices.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, customer_id, amount, tax_amount, description, currency, is_billable, is_billed
      FROM expenses WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Expense was not found." });
    const expense = rows[0];
    if (!expense.is_billable) return fail(422, { code: "NOT_BILLABLE", message: "This expense is not marked billable." });
    if (expense.is_billed) return fail(409, { code: "ALREADY_BILLED", message: "This expense has already been invoiced." });
    if (!expense.customer_id) return fail(422, { code: "NO_CUSTOMER", message: "Set a customer on the expense before billing it." });

    const amount = Number(expense.amount ?? 0);
    const today = new Date().toISOString().slice(0, 10);
    const parsed = invoiceSchema.safeParse({
      contact_id: String(expense.customer_id),
      issue_date: today,
      due_date: today,
      status: "draft",
      currency: String(expense.currency ?? "INR"),
      subtotal: amount,
      total: amount,
      balance_due: amount,
      line_items: [{ description: `Reimbursable expense — ${String(expense.description ?? "Expense")}`, quantity: 1, rate: amount, discount: 0 }]
    });
    if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Could not build an invoice from this expense.", details: parsed.error.flatten() });

    const numbering = await loadInvoiceSettings(prisma, orgId);
    const result = await prisma.$transaction(async (tx) => {
      let data = parsed.data;
      if (numbering.auto_generate_number) {
        data = { ...data, invoice_number: await nextDocumentNumber(tx, orgId, "invoice", { locationId: null, fallbackPrefix: numbering.prefix, fallbackFloor: numbering.next_number }) };
      }
      const inv = await saveInvoice(tx, orgId, userId, data);
      await tx.$executeRaw`UPDATE expenses SET is_billed = true, billed_invoice_id = ${inv.id}::uuid, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return inv;
    });

    const num = (await prisma.$queryRaw`SELECT invoice_number FROM invoices WHERE id = ${result.id}::uuid`) as Array<{ invoice_number: string }>;
    return ok({ invoice_id: result.id, invoice_number: num[0]?.invoice_number ?? null, redirect: `/invoices/${result.id}` });
  } catch (error) {
    return fail(400, { code: "CONVERT_FAILED", message: errorMessage(error) });
  }
}
