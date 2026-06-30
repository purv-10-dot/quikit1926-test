import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { postVendorCredit, resolveControlAccounts, round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Convert a draft vendor credit to open — posts its journal entry. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ vendor_credit_number: string; tax_total: string; total: string; ap_account_id: string | null; place_of_supply: string | null; issue_date: Date; status: string; discount_total: string }>>`
        SELECT vendor_credit_number, tax_total, total, ap_account_id, place_of_supply, discount_total,
               to_char(issue_date,'YYYY-MM-DD') AS issue_date, status
        FROM vendor_credits WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!rows.length) throw new Error("Vendor credit was not found.");
      const vc = rows[0];
      if (vc.status !== "draft") throw new Error("Only a draft vendor credit can be converted to open.");

      const accounts = await resolveControlAccounts(tx, orgId);
      if (vc.ap_account_id) accounts.payable = vc.ap_account_id;

      const lines = await tx.$queryRaw<Array<{ account_id: string | null; line_total: string }>>`
        SELECT account_id, line_total FROM vendor_credit_lines WHERE vendor_credit_id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      const expenseCredits = lines.map((l) => ({ account_id: l.account_id ?? accounts.defaultExpense ?? "", amount: round2(Number(l.line_total)) }));
      // Keep the entry balanced when stored line nets don't reconcile to total − tax
      // (e.g. an adjustment on the header, or a header-only credit with no lines).
      const lineSum = round2(expenseCredits.reduce((s, c) => s + c.amount, 0));
      const expectedNet = round2(Number(vc.total) - Number(vc.tax_total));
      if (lineSum !== expectedNet && accounts.defaultExpense) {
        expenseCredits.push({ account_id: accounts.defaultExpense, amount: round2(expectedNet - lineSum) });
      }

      const journalId = await postVendorCredit(tx, orgId, userId, {
        id: params.id, issue_date: String(vc.issue_date), vendor_credit_number: vc.vendor_credit_number,
        tax_total: round2(Number(vc.tax_total)), total: round2(Number(vc.total)), place_of_supply: vc.place_of_supply
      }, expenseCredits, accounts);
      await tx.$executeRaw`UPDATE vendor_credits SET status = 'open', journal_entry_id = ${journalId}::uuid, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { journalId };
    });
    return ok({ id: params.id, status: "open", journal_entry_id: result.journalId });
  } catch (error) {
    return fail(400, { code: "OPEN_FAILED", message: errorMessage(error) });
  }
}
