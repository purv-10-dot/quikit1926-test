import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/apps/launcher
 *
 * Returns all apps in the registry with an `installed` flag indicating
 * whether the current user's org has access. Used by the App Launcher page.
 *
 * Handles the case where tenantId is NOT in the JWT session yet
 * (user just logged in but hasn't selected an org, OR the session
 * update from select-org didn't persist). Falls back to looking up
 * the user's first active membership.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Try to get tenantId from session, or fall back to the user's first active membership
  let tenantId = session.user.tenantId;
  if (!tenantId) {
    const membership = await db.membership.findFirst({
      where: { userId, status: "active" },
      select: { tenantId: true },
      orderBy: { createdAt: "asc" },
    });
    tenantId = membership?.tenantId ?? undefined;
  }

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
