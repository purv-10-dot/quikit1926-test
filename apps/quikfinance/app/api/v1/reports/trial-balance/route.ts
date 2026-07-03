import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT code, name, debit, credit FROM v_trial_balance
      WHERE org_id = ${orgId}::uuid AND (debit <> 0 OR credit <> 0)
      ORDER BY code
    `) as Array<{ code: string; name: string; debit: unknown; credit: unknown }>;

    let totalDebit = 0;
    let totalCredit = 0;
    const reportRows = rows.map((row) => {
      const debit = Number(row.debit ?? 0);
      const credit = Number(row.credit ?? 0);
      totalDebit += debit;
      totalCredit += credit;
      return { id: row.code, code: row.code, name: row.name, debit, credit };
    });

    return ok({
      key: "trial-balance",
      title: "Trial Balance",
      description: "Debit and credit balances across all ledger accounts.",
      apiPath: "/api/v1/reports/trial-balance",
      columns: [
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "debit", label: "Debit", kind: "money" },
        { key: "credit", label: "Credit", kind: "money" }
      ],
      rows: reportRows,
      summary: [
        { label: "Total Debit", value: Number(totalDebit.toFixed(2)), tone: "neutral" },
        { label: "Total Credit", value: Number(totalCredit.toFixed(2)), tone: "neutral" },
        { label: "Difference", value: Number((totalDebit - totalCredit).toFixed(2)), tone: Math.abs(totalDebit - totalCredit) < 0.01 ? "good" : "warn" }
      ]
    });
  } catch (error) {
    return fail(500, { code: "REPORT_FAILED", message: errorMessage(error) });
  }
}
