import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { userCan } from "@/lib/api/permissions";
import { employeeIdForEmail } from "@/lib/api/assetScope";

const auth = withOrgAuthForResource("Notification");

export const GET = auth.view(async ({ orgId, userId, userEmail }) => {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const todayStr = now.toISOString().split("T")[0];
  const limitStr = thirtyDaysLater.toISOString().split("T")[0];

  // Managers/admins (Asset:viewAll) get the full org feed. Everyone else is
  // scoped to alerts for the assets assigned to them — same email-match STOPGAP
  // as /api/assets — and does NOT get the org-wide audit-log activity stream.
  const canViewAll = await userCan(userId, orgId, "Asset", "viewAll");

  // For a Member, their active assignment rows do double duty: they scope the
  // warranty/repair alerts below AND drive the new-assignment alerts (a Member
  // has no audit-log feed, so this is their only signal that an asset was
  // assigned to them). Empty for viewAll holders — they use the audit stream.
  type MyAssignment = {
    id: string;
    assetId: string;
    assignedAt: Date;
    asset: { itemName: string; itemCode: string } | null;
  };
  let assignedIds: string[] | null = null;
  let myAssignments: MyAssignment[] = [];
  if (!canViewAll) {
    const employeeId = await employeeIdForEmail(orgId, userEmail);
    // No matching employee → nothing to show (no activity leak).
    if (!employeeId) {
      return NextResponse.json({ success: true, data: [] });
    }
    myAssignments = await db.astAssignment.findMany({
      where: { orgId, userId: employeeId, status: "Active" },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        assetId: true,
        assignedAt: true,
        asset: { select: { itemName: true, itemCode: true } },
      },
    });
    assignedIds = [...new Set(myAssignments.map((a) => a.assetId))];
    // No assigned assets → nothing to show.
    if (assignedIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }
  }

  const assetScope = assignedIds ? { id: { in: assignedIds } } : {};
  const repairScope = assignedIds ? { assetId: { in: assignedIds } } : {};

  const [auditLogs, assets, repairs] = await Promise.all([
    // Org-wide activity stream is an admin/manager tool — withheld from Members.
    canViewAll
      ? db.astAuditLog.findMany({
          where: { orgId },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
    db.astAsset.findMany({
      where: {
        orgId,
        warrantyEndDate: { gte: todayStr, lte: limitStr },
        ...assetScope,
      },
      include: { category: true },
    }),
    db.astRepair.findMany({
      where: { orgId, status: { in: ["Pending", "InRepair"] }, ...repairScope },
      include: { asset: { select: { itemName: true, itemCode: true } } },
      orderBy: { createdAt: "desc" },
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

  // New-assignment alerts (Member-only). A Member has no audit-log feed, so an
  // asset being assigned to them would otherwise be invisible. We surface each
  // asset assigned to THEM (query is scoped to their employee id — never another
  // person's assignment) within the last 30 days, so it reads as "new" and ages
  // out. viewAll holders get assignment events through the audit stream above,
  // so `myAssignments` is empty for them and this loop is a no-op.
  for (const a of myAssignments) {
    const assignedMs = new Date(a.assignedAt).getTime();
    if (!Number.isFinite(assignedMs) || assignedMs < thirtyDaysAgo.getTime()) continue;
    notifications.push({
      id: `assignment-${a.id}`,
      type: "assignment",
      title: "New Asset Assigned",
      body: `${a.asset?.itemName} (${a.asset?.itemCode}) assigned to you`,
      createdAt: new Date(a.assignedAt).toISOString(),
      source: "Assignments",
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
