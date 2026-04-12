import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/apps/launcher
 *
 * Returns all apps in the registry with an `installed` flag indicating
 * whether the current user's org has access. Used by the App Launcher page.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  const userId = session.user.id;

  // Get all active apps
  const allApps = await db.app.findMany({
    where: { status: { not: "disabled" } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      baseUrl: true,
      status: true,
    },
    orderBy: { name: "asc" },
  });

  // Get this user's app access records
  const accessRecords = tenantId
    ? await db.userAppAccess.findMany({
        where: { userId, tenantId },
        select: { appId: true, role: true },
      })
    : [];

  const accessMap = new Map(accessRecords.map((a) => [a.appId, a.role]));

  const data = allApps.map((app) => ({
    ...app,
    installed: accessMap.has(app.id),
    role: accessMap.get(app.id) ?? undefined,
  }));

  return NextResponse.json({ success: true, data });
}
