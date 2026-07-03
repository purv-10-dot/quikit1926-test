import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Report");

type RepairLite = { actualCost: number | null; estimatedCost: number | null; status: string };

export const GET = auth.view(async ({ orgId }) => {
  const users = await db.astEmployee.findMany({
    where: { orgId },
    include: {
      assignments: {
        where: { status: "Active" },
        include: {
          asset: {
            select: { price: true, repairs: { select: { actualCost: true, estimatedCost: true, status: true } } },
          },
        },
      },
    },
  });

  const deptMap: Record<
    string,
    {
      department: string;
      employeeCount: number;
      assetCount: number;
      totalAssetValue: number;
      totalRepairCost: number;
    }
  > = {};

  for (const u of users) {
    const dept = u.department ?? "Unassigned";
    if (!deptMap[dept])
      deptMap[dept] = {
        department: dept,
        employeeCount: 0,
        assetCount: 0,
        totalAssetValue: 0,
        totalRepairCost: 0,
      };
    deptMap[dept].employeeCount++;
    for (const asgn of u.assignments) {
      deptMap[dept].assetCount++;
      deptMap[dept].totalAssetValue += asgn.asset?.price ?? 0;
      const repairCost = (asgn.asset?.repairs ?? [])
        .filter((r: RepairLite) => r.status === "Repaired" || r.status === "Recovered")
        .reduce((s: number, r: RepairLite) => s + (r.actualCost ?? r.estimatedCost ?? 0), 0);
      deptMap[dept].totalRepairCost += repairCost;
    }
  }

  const rows = Object.values(deptMap)
    .map((d) => ({
      ...d,
      totalAssetValue: Math.round(d.totalAssetValue),
      totalRepairCost: Math.round(d.totalRepairCost),
      totalSpend: Math.round(d.totalAssetValue + d.totalRepairCost),
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);

  return NextResponse.json({ success: true, data: rows });
});
