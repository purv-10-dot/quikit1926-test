import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

/** Scoped lists for the client portal. ?type=invoices|quotes|orders|payments|credit-notes */
export async function GET(request: NextRequest) {
  const guard = await portalRoute("client", "view");
  if (!guard.ok) return guard.response;
  const { orgId, contactId } = guard.context;
  if (!contactId) return ok([]);
  const type = request.nextUrl.searchParams.get("type") ?? "invoices";

  try {
    let rows: unknown[] = [];
    switch (type) {
      case "invoices":
        rows = (await prisma.$queryRaw`SELECT id, invoice_number, issue_date, due_date, total, balance_due, status FROM invoices WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY issue_date DESC NULLS LAST, created_at DESC LIMIT 200`) as unknown[];
        break;
      case "quotes":
        rows = (await prisma.$queryRaw`SELECT id, quotation_number, total, status, created_at FROM quotations WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY created_at DESC LIMIT 200`) as unknown[];
        break;
      case "orders":
        rows = (await prisma.$queryRaw`SELECT id, total, status, created_at FROM sales_orders WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY created_at DESC LIMIT 200`) as unknown[];
        break;
      case "payments":
        rows = (await prisma.$queryRaw`SELECT id, payment_number, amount, payment_date, status FROM payments WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY payment_date DESC NULLS LAST, created_at DESC LIMIT 200`) as unknown[];
        break;
      case "credit-notes":
        rows = (await prisma.$queryRaw`SELECT id, credit_note_number, total, status, created_at FROM credit_notes WHERE org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid ORDER BY created_at DESC LIMIT 200`) as unknown[];
        break;
      default:
        return fail(422, { code: "BAD_TYPE", message: "Unknown list type." });
    }
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "LIST_FAILED", message: errorMessage(error) });
  }
}
