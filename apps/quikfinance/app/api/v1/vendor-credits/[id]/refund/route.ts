import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { createJournalEntry, resolveControlAccounts, round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Record a cash refund received from the vendor for the remaining credit (Dr Bank, Cr A/P to consume the credit). */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: { amount?: number } = {};
  try { body = (await request.json()) as { amount?: number }; } catch { body = {}; }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ vendor_credit_number: string; balance: string; ap_account_id: string | null; issue_date: Date; status: string }>>`
        SELECT vendor_credit_number, balance, ap_account_id, to_char(issue_date,'YYYY-MM-DD') AS issue_date, status
        FROM vendor_credits WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!rows.length) throw new Error("Vendor credit was not found.");
      const vc = rows[0];
      if (vc.status === "draft") throw new Error("Convert the vendor credit to open before refunding it.");
      const available = round2(Number(vc.balance));
      const amount = round2(Math.min(body.amount && body.amount > 0 ? body.amount : available, available));
      if (amount <= 0) throw new Error("No credit balance remaining to refund.");

      const accounts = await resolveControlAccounts(tx, orgId);
      const payable = vc.ap_account_id ?? accounts.payable;
      if (!payable) throw new Error("Chart of accounts is missing Accounts Payable.");
      const bank = accounts.cash; // bank, falling back to cash
      if (!bank) throw new Error("No bank or cash account found to receive the refund into.");

      await createJournalEntry(tx, {
        orgId, entryDate: String(vc.issue_date), memo: `Refund of vendor credit ${vc.vendor_credit_number}`,
        sourceType: "vendor_credit_refund", sourceId: params.id, createdBy: userId,
        lines: [
          { account_id: bank, debit: amount, credit: 0, description: `Refund ${vc.vendor_credit_number}` },
          { account_id: payable, debit: 0, credit: amount, description: `Refund ${vc.vendor_credit_number}` }
        ]
      });

      const newBalance = round2(available - amount);
      await tx.$executeRaw`UPDATE vendor_credits SET balance = ${newBalance}, status = ${newBalance <= 0 ? "closed" : "open"}, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { amount, newBalance };
    });
    return ok({ id: params.id, refunded: result.amount, balance: result.newBalance });
  } catch (error) {
    return fail(400, { code: "REFUND_FAILED", message: errorMessage(error) });
  }
}
