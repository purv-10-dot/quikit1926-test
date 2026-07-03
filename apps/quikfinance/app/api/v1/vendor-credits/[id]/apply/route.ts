import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/**
 * Apply this vendor credit's remaining balance against an open bill for the same
 * vendor. Both documents already hit Accounts Payable when posted, so applying
 * one to the other nets within A/P — no new journal entry is required, only the
 * running balances are adjusted (mirrors credit-note → invoice).
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  let body: { bill_id?: string; amount?: number } = {};
  try { body = (await request.json()) as { bill_id?: string; amount?: number }; } catch { body = {}; }
  if (!body.bill_id) return fail(422, { code: "VALIDATION_FAILED", message: "A bill is required." });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const vcRows = await tx.$queryRaw<Array<{ balance: string; contact_id: string; status: string }>>`
        SELECT balance, contact_id, status FROM vendor_credits WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!vcRows.length) throw new Error("Vendor credit was not found.");
      if (vcRows[0].status === "draft") throw new Error("Convert the vendor credit to open before applying it.");
      const billRows = await tx.$queryRaw<Array<{ balance_due: string; contact_id: string }>>`
        SELECT balance_due, contact_id FROM bills WHERE id = ${body.bill_id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!billRows.length) throw new Error("Bill was not found.");
      if (billRows[0].contact_id !== vcRows[0].contact_id) throw new Error("The bill belongs to a different vendor.");

      const credit = round2(Number(vcRows[0].balance));
      const due = round2(Number(billRows[0].balance_due));
      const amount = round2(Math.min(body.amount && body.amount > 0 ? body.amount : credit, credit, due));
      if (amount <= 0) throw new Error("Nothing to apply — the credit or the bill balance is zero.");

      const newBillDue = round2(due - amount);
      const newCredit = round2(credit - amount);
      await tx.$executeRaw`UPDATE bills SET balance_due = ${newBillDue}, status = ${newBillDue <= 0 ? "paid" : "partial"}, updated_at = now() WHERE id = ${body.bill_id}::uuid AND org_id = ${orgId}::uuid`;
      await tx.$executeRaw`UPDATE vendor_credits SET balance = ${newCredit}, status = ${newCredit <= 0 ? "closed" : "open"}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { amount, newCredit, newBillDue };
    });
    return ok({ id: params.id, applied: result.amount, balance: result.newCredit, bill_balance_due: result.newBillDue });
  } catch (error) {
    return fail(400, { code: "APPLY_FAILED", message: errorMessage(error) });
  }
}
