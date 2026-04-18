import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { db } from "@/lib/db";

export const GET = withAdminAuth(async ({ tenantId }) => {
  const blocked = await gateModuleApi("admin", "apps", tenantId);
  if (blocked) return blocked as NextResponse;

  const apps = await db.app.findMany({
    orderBy: { name: "asc" },
  });

  // Get access counts per app for this tenant
  const accessCounts = await db.userAppAccess.groupBy({
    by: ["appId"],
    where: { tenantId },
    _count: { userId: true },
  });

  const countMap = new Map(accessCounts.map((a) => [a.appId, a._count.userId]));

  const data = apps.map((app) => ({
    id: app.id,
    name: app.name,
    slug: app.slug,
    description: app.description,
    iconUrl: app.iconUrl,
    baseUrl: app.baseUrl,
    status: app.status,
    accessCount: countMap.get(app.id) || 0,
  }));

  return NextResponse.json({ success: true, data });
});
