import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/**
 * General Ledger: every posted journal line in a period, with a running balance.
 * Uses the real column names (journal_entries.entry_date / reference_number,
 * journal_entry_lines.description) — the previous PostgREST-style query referred
 * to non-existent columns ("date", "reference", line "memo") and always 500'd.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");
  const from = searchParams.get("from") ?? `${new Date().getFullYear()}-01-01`;
  const to = searchParams.get("to") ?? new Date().toISOString().split("T")[0];
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 100)));
  const offset = (page - 1) * limit;

  try {
    const acctFilter = accountId ? Prisma.sql`AND jl.account_id = ${accountId}::uuid` : Prisma.empty;

    const countRows = (await prisma.$queryRaw`
      SELECT COUNT(*)::bigint AS count
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.org_id = ${orgId}::uuid AND je.status = 'posted'
        AND je.entry_date >= ${from}::date AND je.entry_date <= ${to}::date ${acctFilter}
    `) as Array<{ count: bigint }>;
    const total = Number(countRows[0]?.count ?? 0);

    const rows = (await prisma.$queryRaw`
      SELECT jl.id, to_char(je.entry_date,'YYYY-MM-DD') AS date,
             je.entry_number, je.reference_number AS reference,
             COALESCE(NULLIF(jl.description,''), je.memo) AS description,
             a.id AS account_id, a.code AS account_code, a.name AS account_name, a.account_type,
             jl.debit, jl.credit
      FROM journal_entry_lines jl
      JOIN journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounts a ON a.id = jl.account_id
      WHERE je.org_id = ${orgId}::uuid AND je.status = 'posted'
        AND je.entry_date >= ${from}::date AND je.entry_date <= ${to}::date ${acctFilter}
      ORDER BY je.entry_date ASC, je.entry_number ASC, jl.display_order ASC
      LIMIT ${limit} OFFSET ${offset}
    `) as Array<Record<string, unknown>>;

    let balance = 0;
    const lines = rows.map((l) => {
      const debit = Number(l.debit ?? 0);
      const credit = Number(l.credit ?? 0);
      balance += debit - credit;
      return {
        id: l.id,
        date: l.date,
        reference: l.reference ?? l.entry_number,
        entry_number: l.entry_number,
        description: l.description ?? "",
        account: { id: l.account_id, code: l.account_code, name: l.account_name, account_type: l.account_type },
        debit,
        credit,
        running_balance: Number(balance.toFixed(2))
      };
    });

    return ok(lines, { total, page, limit, period: { from, to } });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}
