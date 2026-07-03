import type { NextRequest } from "next/server";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";

export const dynamic = "force-dynamic";

const ACCEPTED = ["accepted", "partially_accepted", "issued"];

/**
 * Vendor submits a bill against an accepted PO. Created as a DRAFT (unposted) —
 * an external party must never post directly to the company ledger. Internal
 * staff review and post it through the finance app. Scoped to the vendor + RBAC.
 * Body: { poId, amount?, billNumber?, dueDate?, notes? }
 */
export async function POST(request: NextRequest) {
  const guard = await portalRoute("vendor", "submit_bill");
  if (!guard.ok) return guard.response;
  const { orgId, contactId } = guard.context;
  if (!contactId) return fail(403, { code: "NO_CONTACT", message: "No vendor account linked." });

  try {
    const body = (await request.json()) as { poId?: string; amount?: number; billNumber?: string; dueDate?: string; notes?: string };
    if (!body.poId) return fail(422, { code: "MISSING_PO", message: "A purchase order is required." });

    const poRows = (await prisma.$queryRaw`
      SELECT id, purchase_order_number, total, status, currency FROM purchase_orders
      WHERE id = ${body.poId}::uuid AND org_id = ${orgId}::uuid AND contact_id = ${contactId}::uuid LIMIT 1
    `) as Array<{ id: string; purchase_order_number: string; total: string; status: string; currency: string | null }>;
    const po = poRows[0];
    if (!po) return fail(404, { code: "PO_NOT_FOUND", message: "Purchase order not found." });
    if (!ACCEPTED.includes(po.status)) return fail(409, { code: "PO_NOT_ACCEPTED", message: "You can only bill an accepted purchase order." });

    const amount = body.amount != null && body.amount > 0 ? Number(body.amount) : Number(po.total ?? 0);
    const billNumber = body.billNumber?.trim() || `VB-${Date.now().toString(36).toUpperCase()}`;
    const dueDate = body.dueDate || null;
    const notes = `Submitted via vendor portal against ${po.purchase_order_number}.${body.notes ? ` ${body.notes}` : ""}`;

    const rows = (await prisma.$queryRaw`
      INSERT INTO bills (org_id, contact_id, bill_number, status, issue_date, due_date, currency, subtotal, total, balance_due, vendor_reference, notes)
      VALUES (${orgId}::uuid, ${contactId}::uuid, ${billNumber}, 'draft', CURRENT_DATE,
              COALESCE(${dueDate}::date, CURRENT_DATE + 30), ${po.currency ?? "INR"}, ${amount}, ${amount}, ${amount},
              ${po.purchase_order_number}, ${notes})
      RETURNING id, bill_number, total, status
    `) as Array<Record<string, unknown>>;

    await prisma.$executeRaw`
      INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, new_values)
      VALUES (${orgId}::uuid, ${guard.context.userId}::uuid, 'vendor_portal_bill_submit', 'bill', ${rows[0].id as string}::uuid, ${JSON.stringify({ poId: po.id, amount })}::jsonb)
    `;

    return ok({ ...rows[0], message: "Bill submitted for approval." }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "BILL_SUBMIT_FAILED", message: errorMessage(error) });
  }
}
