import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/apps/switcher
 *
 * Returns the list of apps the current user has access to.
 * Used by the AppSwitcher component in the header.
 * Queries the shared database directly (no cross-origin needed).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  let tenantId = session.user.tenantId;

  // Fall back to first active membership if tenantId not in session
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

  // Get user's app access records
  const accessRecords = tenantId
    ? await db.userAppAccess.findMany({
        where: { userId, tenantId },
        select: { appId: true },
      })
    : [];

  const accessSet = new Set(accessRecords.map((a) => a.appId));

  // Only return installed apps
  const data = allApps.filter((app) => accessSet.has(app.id));

  // The IdP base URL lives in QUIKIT_URL (server-side, required for OAuth).
  // Include it in the response so the AppSwitcher's "View all apps" link
  // does not depend on NEXT_PUBLIC_QUIKIT_URL being set at build time.
  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      // Per-user response — never share. Browser serves from cache for 30s,
      // tolerates 60s of staleness while revalidating in background.
      // See docs/plans/P1-2-cache-control-headers.md.
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
}
