import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { billSchema } from "@/lib/validations/bill.schema";
import { saveBill } from "@/lib/accounting/bill-service";
import { assertPeriodUnlocked } from "@/lib/period-locks";

export const dynamic = "force-dynamic";

/**
 * Approve & post a draft bill (e.g. one a vendor submitted via the portal).
 * Internal-only (requireApiContext). Reconstructs a BillInput from the stored
 * draft + a single expense line and posts it through the shared bill service /
 * GL engine. Body: { expenseAccountId?, dueDate? }.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { orgId, userId } = auth.context;

  try {
    const body = (await request.json().catch(() => ({}))) as { expenseAccountId?: string; dueDate?: string };

    const rows = (await prisma.$queryRaw`
      SELECT id, contact_id, bill_number, status, to_char(issue_date,'YYYY-MM-DD') AS issue_date,
             to_char(due_date,'YYYY-MM-DD') AS due_date, currency, exchange_rate, total, vendor_reference, notes
      FROM bills WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1
    `) as Array<Record<string, unknown>>;
    const bill = rows[0];
    if (!bill) return fail(404, { code: "NOT_FOUND", message: "Bill not found." });
    if (bill.status !== "draft") return fail(409, { code: "NOT_DRAFT", message: "Only draft bills can be approved." });

    const lockResponse = await assertPeriodUnlocked(auth.context, String(bill.issue_date), "purchases");
    if (lockResponse) return lockResponse;

    const total = Number(bill.total ?? 0);
    if (total <= 0) return fail(422, { code: "ZERO_TOTAL", message: "Bill total must be greater than zero." });

    const raw = {
      contact_id: String(bill.contact_id),
      bill_number: String(bill.bill_number),
      issue_date: String(bill.issue_date),
      due_date: body.dueDate ?? String(bill.due_date),
      status: "open" as const,
      currency: (bill.currency as string) ?? "INR",
      exchange_rate: Number(bill.exchange_rate ?? 1) || 1,
      // subtotal/total/balance_due satisfy schema validation; saveBill recomputes from lines.
      subtotal: total,
      total,
      balance_due: total,
      vendor_reference: (bill.vendor_reference as string) ?? null,
      notes: (bill.notes as string) ?? null,
      line_items: [{
        description: `Bill ${bill.bill_number}${bill.vendor_reference ? ` (${bill.vendor_reference})` : ""}`,
        quantity: 1,
        rate: total,
        account_id: body.expenseAccountId ?? null
      }]
    };
    const parsed = billSchema.parse(raw);

    const result = await prisma.$transaction((tx) => saveBill(tx, orgId, userId, parsed, String(bill.id)));

    await prisma.$executeRaw`
      INSERT INTO audit_logs (org_id, user_id, action, entity_type, entity_id, new_values)
      VALUES (${orgId}::uuid, ${userId}::uuid, 'bill_approve_post', 'bill', ${String(bill.id)}::uuid, ${JSON.stringify({ total })}::jsonb)
    `;

    return ok({ id: result.id, billNumber: bill.bill_number, status: "open", posted: true });
  } catch (error) {
    return fail(400, { code: "APPROVE_FAILED", message: errorMessage(error) });
  }
}
