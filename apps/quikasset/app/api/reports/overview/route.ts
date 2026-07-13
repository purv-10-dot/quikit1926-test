import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Report");

export const GET = auth.view(async ({ orgId }) => {
  const [assets, repairs] = await Promise.all([
    db.astAsset.findMany({
      where: { orgId },
      select: {
        price: true,
        assetStatus: true,
        createdAt: true,
        assignments: { select: { assignedAt: true }, orderBy: { assignedAt: "desc" }, take: 1 },
      },
    }),
    db.astRepair.findMany({
      where: { orgId },
      select: { estimatedCost: true, actualCost: true, status: true, createdAt: true, sentDate: true },
    }),
  ]);

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const totalPortfolioValue = assets.reduce((s, a) => s + (a.price ?? 0), 0);
  const assignedCount = assets.filter((a) => a.assetStatus === "Assigned").length;
  const availableCount = assets.filter((a) => a.assetStatus === "Available").length;
  const inRepairCount = assets.filter((a) => a.assetStatus === "InRepair").length;
  const retiredCount = assets.filter((a) => a.assetStatus === "Retired").length;

  const completedRepairs = repairs.filter((r) => r.status === "Recovered" || r.status === "Repaired");
  const totalRepairSpend = completedRepairs.reduce((s, r) => s + (r.actualCost ?? r.estimatedCost ?? 0), 0);
  const ytdRepairSpend = completedRepairs
    .filter((r) => new Date(r.sentDate) >= yearStart)
    .reduce((s, r) => s + (r.actualCost ?? r.estimatedCost ?? 0), 0);
  const avgRepairCost = completedRepairs.length > 0 ? totalRepairSpend / completedRepairs.length : 0;

  // Idle: available and never assigned, or last assignment > 90 days ago
  const idleAssets = assets.filter((a) => {
    if (a.assetStatus !== "Available") return false;
    const lastAssigned = a.assignments[0]?.assignedAt;
    if (!lastAssigned) return true;
    const daysSince = (now.getTime() - new Date(lastAssigned).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 90;
  });
  const idleAssetCount = idleAssets.length;
  const idleAssetValue = idleAssets.reduce((s, a) => s + (a.price ?? 0), 0);

  // Monthly repair spend — last 12 months
  const monthlyMap: Record<string, number> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleString("en-US", { month: "short", year: "numeric" });
    monthlyMap[key] = 0;
  }
  for (const r of completedRepairs) {
    const d = new Date(r.sentDate);
    if (d >= new Date(now.getFullYear(), now.getMonth() - 11, 1)) {
      const key = d.toLocaleString("en-US", { month: "short", year: "numeric" });
      if (key in monthlyMap) monthlyMap[key] += r.actualCost ?? r.estimatedCost ?? 0;
    }
  }
  const monthlyRepairSpend = Object.entries(monthlyMap).map(([month, amount]) => ({
    month,
    amount: Math.round(amount),
  }));

  // Budget utilization — using FiscalBudget
  const now2 = new Date();
  const fyStartYear = now2.getMonth() >= 3 ? now2.getFullYear() : now2.getFullYear() - 1;
  const currentFY = `FY ${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`;

  const fiscalBudget = await db.astFiscalBudget.findUnique({
    where: { orgId_fiscalYear: { orgId, fiscalYear: currentFY } },
  });

  let budgetUtilPct: number | null = null;
  if (fiscalBudget) {
    const totalBudget =
      fiscalBudget.q1Amount + fiscalBudget.q2Amount + fiscalBudget.q3Amount + fiscalBudget.q4Amount;
    if (totalBudget > 0) {
      const fyStart = `${fyStartYear}-04-01`;
      const fyEnd = `${fyStartYear + 1}-03-31`;

      const [assetSpend, repairSpend] = await Promise.all([
        db.astAsset.aggregate({
          where: { orgId, purchaseDate: { gte: fyStart, lte: fyEnd } },
          _sum: { price: true },
        }),
        db.astRepair.aggregate({
          where: { orgId, sentDate: { gte: fyStart, lte: fyEnd } },
          _sum: { actualCost: true },
        }),
      ]);
      const ytdActual = (assetSpend._sum.price ?? 0) + (repairSpend._sum.actualCost ?? 0);
      budgetUtilPct = Math.round((ytdActual / totalBudget) * 100);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      totalAssets: assets.length,
      totalPortfolioValue: Math.round(totalPortfolioValue),
      assignedCount,
      availableCount,
      inRepairCount,
      retiredCount,
      totalRepairSpend: Math.round(totalRepairSpend),
      ytdRepairSpend: Math.round(ytdRepairSpend),
      avgRepairCost: Math.round(avgRepairCost),
      idleAssetCount,
      idleAssetValue: Math.round(idleAssetValue),
      budgetUtilPct,
      monthlyRepairSpend,
    },
  });
});
