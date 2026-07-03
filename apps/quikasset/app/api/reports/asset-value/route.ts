import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Report");

export const GET = auth.view(async ({ orgId }) => {
  const assets = await db.astAsset.findMany({
    where: { orgId },
    include: {
      category: { select: { name: true } },
      baseCategory: { select: { name: true } },
      repairs: { select: { actualCost: true } },
    },
    orderBy: { purchaseDate: "desc" },
  });

  const rows = assets.map((a) => ({
    id: a.id,
    itemName: a.itemName,
    itemCode: a.itemCode,
    category: a.category?.name ?? "—",
    baseCategory: a.baseCategory?.name ?? "—",
    purchaseDate: a.purchaseDate,
    price: a.price ?? 0,
    assetStatus: a.assetStatus,
    condition: a.condition,
    totalRepairCost: a.repairs.reduce((s, r) => s + (r.actualCost ?? 0), 0) || null,
    tco: (a.price ?? 0) + a.repairs.reduce((s, r) => s + (r.actualCost ?? 0), 0),
  }));

  return NextResponse.json({ success: true, data: rows });
});
