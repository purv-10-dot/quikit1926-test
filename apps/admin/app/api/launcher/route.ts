import { NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/api/withAdminAuth";
import { db } from "@/lib/db";

/**
 * Launcher data for the admin-next portal. Lists provisioned apps via the
 * shared `OrgAppAccess` table (sparse — apps without a row are considered
 * provisioned).
 */
export const GET = withAdminAuth(async ({ orgId, userId }) => {
  const [org, user, allApps, accessRows] = await Promise.all([
    db.org.findUnique({
      where: { id: orgId },
      select: { name: true, logoUrl: true },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true, avatar: true },
    }),
    db.app.findMany({
      where: { status: "active" },
      select: { id: true, name: true, slug: true, baseUrl: true, iconUrl: true },
      orderBy: { name: "asc" },
    }),
    db.orgAppAccess.findMany({
      where: { orgId },
      select: { appId: true, enabled: true },
    }),
  ]);

  const enabledByAppId = new Map(accessRows.map((r) => [r.appId, r.enabled]));
  const apps = allApps.filter((app) => enabledByAppId.get(app.id) !== false);

  return NextResponse.json({
    success: true,
    data: {
      orgName: org?.name ?? "",
      orgLogoUrl: org?.logoUrl ?? null,
      user: {
        name: user ? `${user.firstName} ${user.lastName}`.trim() : "",
        email: user?.email ?? "",
      },
      apps,
    },
  });
});
