import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

const auth = withOrgAuthForResource("Notification");

export const GET = auth.view(async ({ orgId }) => {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];
  const limitStr = thirtyDaysLater.toISOString().split("T")[0];

  const [auditLogs, assets, repairs] = await Promise.all([
    db.astAuditLog.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.astAsset.findMany({
      where: {
        orgId,
        warrantyEndDate: { gte: todayStr, lte: limitStr },
      },
      include: { category: true },
    }),
    db.astRepair.findMany({
      where: { orgId, status: { in: ["Pending", "InRepair"] } },
      include: { asset: { select: { itemName: true, itemCode: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.astReplacement.findMany({
      where: { orgId, isActive: true },
      include: {
        asset: { select: { itemName: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  type Notif = {
    id: string;
    type: "asset" | "assignment" | "repair" | "warranty" | "replacement" | "user" | "system";
    title: string;
    body: string;
    createdAt: string;
    source: string;
  };

  const notifications: Notif[] = [];

  // From audit logs — map to notification format
  const typeMap: Record<string, Notif["type"]> = {
    Assets: "asset",
    Assignments: "assignment",
    Repairs: "repair",
    Replacements: "replacement",
    Users: "user",
  };
  for (const log of auditLogs) {
    notifications.push({
      id: `log-${log.id}`,
      type: typeMap[log.module] ?? "system",
      title: log.action,
      body: log.entityName + (log.details ? ` · ${log.details}` : ""),
      createdAt: log.createdAt.toISOString(),
      source: log.module,
    });
  }

  // Warranty alerts
  for (const asset of assets) {
    const daysLeft = Math.ceil(
      (new Date(asset.warrantyEndDate!).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    notifications.push({
      id: `warranty-${asset.id}`,
      type: "warranty",
      title: "Warranty Expiring Soon",
      body: `${asset.itemName} (${asset.itemCode}) — warranty expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
      createdAt: now.toISOString(),
      source: "System Alert",
    });
  }

  // Active repairs alert
  for (const repair of repairs) {
    const daysSince = Math.floor((now.getTime() - new Date(repair.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince >= 3) {
      notifications.push({
        id: `repair-alert-${repair.id}`,
        type: "repair",
        title: "Repair Pending Follow-up",
        body: `${repair.asset?.itemName} (${repair.asset?.itemCode}) — ${repair.status} for ${daysSince} days`,
        createdAt: repair.createdAt.toISOString(),
        source: "Repairs",
      });
    }
  }

  // Sort by createdAt desc
  notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ success: true, data: notifications.slice(0, 150) });
});
