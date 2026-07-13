import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

const ASSET_TYPES = new Set(["cash", "bank", "accounts_receivable", "other_current_asset", "fixed_asset", "other_asset"]);
const LIABILITY_TYPES = new Set(["accounts_payable", "other_current_liability", "long_term_liability"]);

function classify(accountType: string): "Assets" | "Liabilities" | "Equity" {
  if (ASSET_TYPES.has(accountType)) return "Assets";
  if (LIABILITY_TYPES.has(accountType)) return "Liabilities";
  return "Equity";
}

export async function GET(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRaw`
      SELECT code, name, account_type, balance FROM v_balance_sheet
      WHERE org_id = ${orgId}::uuid AND balance <> 0
      ORDER BY account_type, code
    `) as Array<{ code: string; name: string; account_type: string; balance: unknown }>;

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    const reportRows = rows.map((row) => {
      const section = classify(row.account_type);
      const balance = Number(row.balance ?? 0);
      if (section === "Assets") assets += balance;
      else if (section === "Liabilities") liabilities += balance;
      else equity += balance;
      return { id: row.code, section, code: row.code, name: row.name, balance: Number(balance.toFixed(2)) };
    });

    // Retained earnings (net income) reconciles the sheet for the period.
    const retained = Number((assets - liabilities - equity).toFixed(2));
    if (Math.abs(retained) >= 0.01) {
      reportRows.push({ id: "current-earnings", section: "Equity", code: "—", name: "Current Period Earnings", balance: retained });
      equity += retained;
    }

    return ok({
      key: "balance-sheet",
      title: "Balance Sheet",
      description: "Assets, liabilities, and equity from the posted general ledger.",
      apiPath: "/api/v1/reports/balance-sheet",
      columns: [
        { key: "section", label: "Section" },
        { key: "code", label: "Code" },
        { key: "name", label: "Account" },
        { key: "balance", label: "Balance", kind: "money" }
      ],
      rows: reportRows,
      summary: [
        { label: "Total Assets", value: Number(assets.toFixed(2)), tone: "good" },
        { label: "Total Liabilities", value: Number(liabilities.toFixed(2)), tone: "warn" },
        { label: "Total Equity", value: Number(equity.toFixed(2)), tone: "neutral" }
      ]
    });
  } catch (error) {
    return fail(500, { code: "REPORT_FAILED", message: errorMessage(error) });
  }
}
