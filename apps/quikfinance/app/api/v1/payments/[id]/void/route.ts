import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { reverseJournalFor } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

// Void a payment: reverse its journal + allocations and restore the affected
// bills'/invoices' balances, but keep the record (status = 'void') for the audit trail.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const exists = (await prisma.$queryRaw`SELECT status FROM payments WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ status: string }>;
    if (!exists.length) return fail(404, { code: "NOT_FOUND", message: "Payment was not found." });
    if (exists[0].status === "void") return fail(409, { code: "ALREADY_VOID", message: "This payment is already void." });

    await prisma.$transaction(async (tx) => {
      const allocs = (await tx.$queryRaw`
        SELECT invoice_id, bill_id FROM payment_allocations WHERE payment_id = ${params.id}::uuid AND org_id = ${orgId}::uuid
      `) as Array<{ invoice_id: string | null; bill_id: string | null }>;

      await tx.$executeRaw`DELETE FROM payment_allocations WHERE payment_id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      await reverseJournalFor(tx, orgId, "payment", params.id);
      await tx.$executeRaw`UPDATE payments SET status = 'void', journal_entry_id = NULL, unapplied_amount = 0, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;

      const billIds = [...new Set(allocs.filter((a) => a.bill_id).map((a) => String(a.bill_id)))];
      for (const billId of billIds) {
        await tx.$executeRaw`
          UPDATE bills SET
            balance_due = GREATEST(0, ROUND(total - tds_amount - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE bill_id = ${billId}::uuid AND org_id = ${orgId}::uuid), 0), 2)),
            status = CASE
              WHEN ROUND(total - tds_amount - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE bill_id = ${billId}::uuid AND org_id = ${orgId}::uuid), 0), 2) <= 0 THEN 'paid'
              WHEN COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE bill_id = ${billId}::uuid AND org_id = ${orgId}::uuid), 0) > 0 THEN 'partial'
              ELSE 'open' END,
            updated_at = now()
          WHERE id = ${billId}::uuid AND org_id = ${orgId}::uuid`;
      }

      const invoiceIds = [...new Set(allocs.filter((a) => a.invoice_id).map((a) => String(a.invoice_id)))];
      for (const invoiceId of invoiceIds) {
        await tx.$executeRaw`
          UPDATE invoices SET
            balance_due = GREATEST(0, ROUND(total - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE invoice_id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid), 0), 2)),
            status = CASE
              WHEN ROUND(total - COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE invoice_id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid), 0), 2) <= 0 THEN 'paid'
              WHEN COALESCE((SELECT SUM(amount) FROM payment_allocations WHERE invoice_id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid), 0) > 0 THEN 'partial'
              ELSE 'sent' END,
            updated_at = now()
          WHERE id = ${invoiceId}::uuid AND org_id = ${orgId}::uuid`;
      }
    });

    return ok({ id: params.id, status: "void" });
  } catch (error) {
    return fail(400, { code: "VOID_FAILED", message: errorMessage(error) });
  }
}
