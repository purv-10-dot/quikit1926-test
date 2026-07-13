import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Dashboard");

export const GET = auth.view(async ({ orgId }) => {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [assets, completedRepairs, recentlyActive, activityAssignments, activityRepairs, totalUsers] =
    await Promise.all([
      db.astAsset.findMany({ where: { orgId }, include: { baseCategory: true } }),
      db.astRepair.findMany({
        where: { orgId, status: { in: ["Repaired", "Recovered"] } },
        select: { actualCost: true, estimatedCost: true, sentDate: true },
      }),
      db.astAssignment.findMany({
        where: { orgId, status: "Active" },
        orderBy: { assignedAt: "desc" },
        take: 8,
        include: {
          asset: { select: { itemName: true, itemCode: true, assetStatus: true } },
          user: { select: { name: true, department: true } },
        },
      }),
      db.astAssignment.findMany({
        where: { orgId },
        orderBy: { assignedAt: "desc" },
        take: 8,
        include: {
          asset: { select: { itemName: true } },
          user: { select: { name: true } },
        },
      }),
      db.astRepair.findMany({
        where: { orgId },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { asset: { select: { itemName: true } } },
      }),
      db.astEmployee.count({ where: { orgId, status: "Active" } }),
    ]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const totalAssets = assets.length;
  const assigned = assets.filter((a) => a.assetStatus === "Assigned").length;
  const available = assets.filter((a) => a.assetStatus === "Available").length;
  const inRepair = assets.filter((a) => a.assetStatus === "InRepair").length;
  const retired = assets.filter((a) => a.assetStatus === "Retired").length;
  const addedThisMonth = assets.filter((a) => new Date(a.createdAt) >= monthStart).length;
  const portfolioValue = assets.reduce((s, a) => s + (a.price ?? 0), 0);
  const ytdRepairCost = completedRepairs
    .filter((r) => new Date(r.sentDate) >= yearStart)
    .reduce((s, r) => s + (r.actualCost ?? r.estimatedCost ?? 0), 0);

  // ── Category breakdown ────────────────────────────────────────────────────
  const COLORS = ["#3b82f6", "#8b5cf6", "#6366f1", "#f59e0b", "#ef4444", "#10b981", "#f97316", "#06b6d4"];
  const catMap: Record<string, { count: number; color: string }> = {};
  let ci = 0;
  for (const a of assets) {
    const name = a.baseCategory?.name ?? "Other";
    if (!catMap[name]) catMap[name] = { count: 0, color: COLORS[ci++ % COLORS.length] };
    catMap[name].count++;
  }
  const categoryBreakdown = Object.entries(catMap)
    .map(([name, v]) => ({ name, count: v.count, color: v.color }))
    .sort((a, b) => b.count - a.count);

  // ── Warranty alerts (next 30 days) ────────────────────────────────────────
  const todayStr = now.toISOString().split("T")[0];
  const limitStr = in30Days.toISOString().split("T")[0];
  const warrantyAlerts = assets
    .filter((a) => a.warrantyEndDate && a.warrantyEndDate >= todayStr && a.warrantyEndDate <= limitStr)
    .map((a) => ({
      id: a.id,
      itemName: a.itemName,
      itemCode: a.itemCode,
      warrantyEndDate: a.warrantyEndDate!,
      daysLeft: Math.ceil((new Date(a.warrantyEndDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Recent activity (from real events) ───────────────────────────────────
  const recentActivity = [
    ...activityAssignments.map((a) => ({
      id: `asgn-${a.id}`,
      module: "Assignments",
      action: a.status === "Active" ? "Asset Assigned" : "Asset Returned",
      entityName: `${a.asset.itemName} → ${a.user.name}`,
      createdAt: a.assignedAt.toISOString(),
    })),
    ...activityRepairs.map((r) => ({
      id: `rep-${r.id}`,
      module: "Repairs",
      action: `Repair ${r.status}`,
      entityName: r.asset.itemName,
      createdAt: r.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return NextResponse.json({
    success: true,
    data: {
      stats: {
        totalAssets,
        assigned,
        available,
        inRepair,
        retired,
        addedThisMonth,
        portfolioValue: Math.round(portfolioValue),
        ytdRepairCost: Math.round(ytdRepairCost),
        totalUsers,
      },
      categoryBreakdown,
      recentlyAssigned: recentlyActive,
      recentActivity,
      warrantyAlerts,
    },
  });
});
