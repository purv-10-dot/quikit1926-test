import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Report");

export const GET = auth.view(async ({ orgId }) => {
  const assets = await db.astAsset.findMany({
    where: { orgId },
    include: {
      category: true,
      assignments: { orderBy: { assignedAt: "desc" }, take: 1 },
    },
  });

  const now = new Date();
  const total = assets.length;
  const assigned = assets.filter((a) => a.assetStatus === "Assigned").length;
  const available = assets.filter((a) => a.assetStatus === "Available").length;
  const inRepair = assets.filter((a) => a.assetStatus === "InRepair").length;
  const retired = assets.filter((a) => a.assetStatus === "Retired").length;

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  const idleAssets = assets
    .filter((a) => {
      if (a.assetStatus !== "Available") return false;
      const lastAssigned = a.assignments[0]?.assignedAt;
      if (!lastAssigned) return true;
      return (now.getTime() - new Date(lastAssigned).getTime()) / (1000 * 60 * 60 * 24) > 30;
    })
    .map((a) => {
      const lastAssigned = a.assignments[0]?.assignedAt ?? null;
      const daysIdle = lastAssigned
        ? Math.floor((now.getTime() - new Date(lastAssigned).getTime()) / (1000 * 60 * 60 * 24))
        : Math.floor((now.getTime() - new Date(a.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: a.id,
        itemName: a.itemName,
        itemCode: a.itemCode,
        category: a.category?.name ?? "—",
        price: a.price,
        daysIdle,
        lastAssigned: lastAssigned ? new Date(lastAssigned).toISOString().split("T")[0] : null,
      };
    })
    .sort((a, b) => b.daysIdle - a.daysIdle);

  return NextResponse.json({
    success: true,
    data: {
      summary: {
        total,
        assigned,
        available,
        inRepair,
        retired,
        assignedPct: pct(assigned),
        availablePct: pct(available),
        inRepairPct: pct(inRepair),
        retiredPct: pct(retired),
      },
      idleAssets,
    },
  });
});
