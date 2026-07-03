import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Report");

// Returns Record<fiscalYear, { q1, q2, q3, q4 }>
// Actual spend = asset purchases + repair actual costs, bucketed by quarter
export const GET = auth.view(async ({ orgId }) => {
  const [assets, repairs, budgets] = await Promise.all([
    db.astAsset.findMany({ where: { orgId }, select: { purchaseDate: true, price: true } }),
    db.astRepair.findMany({ where: { orgId }, select: { sentDate: true, actualCost: true } }),
    db.astFiscalBudget.findMany({ where: { orgId }, select: { fiscalYear: true } }),
  ]);

  // Helper: given a date string "YYYY-MM-DD", return { fy: "FY XXXX-XX", q: 1|2|3|4 }
  function getQuarter(dateStr: string): { fy: string; q: 1 | 2 | 3 | 4 } | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const month = d.getMonth() + 1; // 1-based
    const year = d.getFullYear();

    let fyStart: number;
    let q: 1 | 2 | 3 | 4;
    if (month >= 4) {
      fyStart = year;
      q = month <= 6 ? 1 : month <= 9 ? 2 : 3;
    } else {
      fyStart = year - 1;
      q = 4;
    }
    const fy = `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`;
    return { fy, q };
  }

  const result: Record<string, { q1: number; q2: number; q3: number; q4: number }> = {};

  // Only compute actuals for FYs that have a budget
  const fySet = new Set(budgets.map((b) => b.fiscalYear));

  function ensure(fy: string) {
    if (!result[fy]) result[fy] = { q1: 0, q2: 0, q3: 0, q4: 0 };
  }

  for (const asset of assets) {
    const info = getQuarter(asset.purchaseDate);
    if (!info || !fySet.has(info.fy)) continue;
    ensure(info.fy);
    result[info.fy][`q${info.q}` as "q1" | "q2" | "q3" | "q4"] += asset.price ?? 0;
  }

  for (const repair of repairs) {
    if (!repair.actualCost) continue;
    const info = getQuarter(repair.sentDate);
    if (!info || !fySet.has(info.fy)) continue;
    ensure(info.fy);
    result[info.fy][`q${info.q}` as "q1" | "q2" | "q3" | "q4"] += repair.actualCost;
  }

  return NextResponse.json({ success: true, data: result });
});
