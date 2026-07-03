import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Apply this credit note's remaining balance against an open invoice for the same customer. */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: { invoice_id?: string; amount?: number } = {};
  try { body = (await request.json()) as { invoice_id?: string; amount?: number }; } catch { body = {}; }
  if (!body.invoice_id) return fail(422, { code: "VALIDATION_FAILED", message: "An invoice is required." });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const cnRows = await tx.$queryRaw<Array<{ balance: string; contact_id: string }>>`
        SELECT balance, contact_id FROM credit_notes WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!cnRows.length) throw new Error("Credit note was not found.");
      const invRows = await tx.$queryRaw<Array<{ balance_due: string; contact_id: string }>>`
        SELECT balance_due, contact_id FROM invoices WHERE id = ${body.invoice_id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!invRows.length) throw new Error("Invoice was not found.");
      if (invRows[0].contact_id !== cnRows[0].contact_id) throw new Error("The invoice belongs to a different customer.");

      const credit = round2(Number(cnRows[0].balance));
      const due = round2(Number(invRows[0].balance_due));
      const amount = round2(Math.min(body.amount && body.amount > 0 ? body.amount : credit, credit, due));
      if (amount <= 0) throw new Error("Nothing to apply — the credit or the invoice balance is zero.");

      const newInvoiceDue = round2(due - amount);
      const newCredit = round2(credit - amount);
      await tx.$executeRaw`UPDATE invoices SET balance_due = ${newInvoiceDue}, status = ${newInvoiceDue <= 0 ? "paid" : "partial"}, updated_at = now() WHERE id = ${body.invoice_id}::uuid AND org_id = ${orgId}::uuid`;
      await tx.$executeRaw`UPDATE credit_notes SET balance = ${newCredit}, status = ${newCredit <= 0 ? "closed" : "open"}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { amount, newCredit, newInvoiceDue };
    });
    return ok({ id: params.id, applied: result.amount, balance: result.newCredit, invoice_balance_due: result.newInvoiceDue });
  } catch (error) {
    return fail(400, { code: "APPLY_FAILED", message: errorMessage(error) });
  }
}
