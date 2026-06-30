import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { postCreditNote, resolveControlAccounts, round2 } from "@/lib/accounting/posting";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Convert a draft credit note to open — posts its journal entry. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ credit_note_number: string; subtotal: string; discount_total: string; round_off: string; tax_total: string; total: string; ar_account_id: string | null; place_of_supply: string | null; issue_date: Date; status: string }>>`
        SELECT credit_note_number, subtotal, discount_total, round_off, tax_total, total, ar_account_id, place_of_supply,
               to_char(issue_date,'YYYY-MM-DD') AS issue_date, status
        FROM credit_notes WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`;
      if (!rows.length) throw new Error("Credit note was not found.");
      const cn = rows[0];
      if (cn.status !== "draft") throw new Error("Only a draft credit note can be converted to open.");

      const accounts = await resolveControlAccounts(tx, orgId);
      if (cn.ar_account_id) accounts.receivable = cn.ar_account_id;
      const netRevenue = round2(Number(cn.subtotal) - Number(cn.discount_total) + Number(cn.round_off));
      const journalId = await postCreditNote(tx, orgId, userId, {
        id: params.id, issue_date: String(cn.issue_date), credit_note_number: cn.credit_note_number,
        subtotal: netRevenue, tax_total: round2(Number(cn.tax_total)), total: round2(Number(cn.total)), place_of_supply: cn.place_of_supply
      }, accounts);
      await tx.$executeRaw`UPDATE credit_notes SET status = 'open', journal_entry_id = ${journalId}::uuid, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
      return { journalId };
    });
    return ok({ id: params.id, status: "open", journal_entry_id: result.journalId });
  } catch (error) {
    return fail(400, { code: "OPEN_FAILED", message: errorMessage(error) });
  }
}
