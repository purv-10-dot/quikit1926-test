import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Report");

export const GET = auth.view(async ({ orgId }, req) => {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const repairs = await db.astRepair.findMany({
    where: {
      orgId,
      ...(from ? { sentDate: { gte: from } } : {}),
      ...(to ? { sentDate: { lte: to } } : {}),
    },
    include: { asset: { include: { category: true, baseCategory: true } } },
    orderBy: { sentDate: "desc" },
  });

  const done = repairs.filter((r) => r.status === "Recovered" || r.status === "Repaired");
  const totalEstimated = done.reduce((s, r) => s + (r.estimatedCost ?? 0), 0);
  const totalActual = done.reduce((s, r) => s + (r.actualCost ?? r.estimatedCost ?? 0), 0);

  // Monthly (last 12 months)
  const now = new Date();
  const monthlyMap: Record<string, { estimated: number; actual: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyMap[d.toLocaleString("en-US", { month: "short", year: "numeric" })] = { estimated: 0, actual: 0 };
  }
  for (const r of repairs) {
    const key = new Date(r.sentDate).toLocaleString("en-US", { month: "short", year: "numeric" });
    if (key in monthlyMap) {
      monthlyMap[key].estimated += r.estimatedCost ?? 0;
      monthlyMap[key].actual += r.actualCost ?? r.estimatedCost ?? 0;
    }
  }
  const monthly = Object.entries(monthlyMap).map(([month, v]) => ({
    month,
    estimated: Math.round(v.estimated),
    actual: Math.round(v.actual),
  }));

  // By vendor
  const vendorMap: Record<string, { count: number; total: number }> = {};
  for (const r of done) {
    const v = r.vendor ?? "Unspecified";
    if (!vendorMap[v]) vendorMap[v] = { count: 0, total: 0 };
    vendorMap[v].count++;
    vendorMap[v].total += r.actualCost ?? r.estimatedCost ?? 0;
  }
  const byVendor = Object.entries(vendorMap)
    .map(([vendor, v]) => ({ vendor, count: v.count, totalActual: Math.round(v.total) }))
    .sort((a, b) => b.totalActual - a.totalActual)
    .slice(0, 8);

  // By category
  const catMap: Record<string, number> = {};
  for (const r of done) {
    const c = r.asset?.category?.name ?? "Uncategorized";
    catMap[c] = (catMap[c] ?? 0) + (r.actualCost ?? r.estimatedCost ?? 0);
  }
  const byCategory = Object.entries(catMap)
    .map(([category, total]) => ({ category, totalActual: Math.round(total) }))
    .sort((a, b) => b.totalActual - a.totalActual);

  const rows = repairs.map((r) => ({
    id: r.id,
    assetName: r.asset?.itemName ?? "—",
    assetCode: r.asset?.itemCode ?? "—",
    category: r.asset?.category?.name ?? "—",
    issueTitle: r.issueTitle,
    vendor: r.vendor,
    sentDate: r.sentDate,
    estimatedCost: r.estimatedCost,
    actualCost: r.actualCost,
    variance:
      r.actualCost != null && r.estimatedCost != null ? Math.round(r.actualCost - r.estimatedCost) : null,
    status: r.status,
  }));

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        totalRepairs: repairs.length,
        totalEstimated: Math.round(totalEstimated),
        totalActual: Math.round(totalActual),
        totalVariance: Math.round(totalActual - totalEstimated),
      },
      monthly,
      byVendor,
      byCategory,
      repairs: rows,
    },
  });
});
