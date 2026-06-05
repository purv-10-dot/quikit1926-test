import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/apps/switcher
 *
 * Returns the list of apps the current user has access to.
 * Used by the QuikitAppSwitcher component in the header.
 * Queries the shared database directly (no cross-origin needed).
 *
 * Mirrors the same route in apps/quikscale + apps/quiktrack — same
 * { success, data, quikitUrl } shape so the local switcher component
 * is byte-compatible with @quikit/ui's AppSwitcher.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  let orgId = session.user.orgId;

  // Fall back to first active membership if orgId not in session
  if (!orgId) {
    const membership = await db.orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.orgId ?? undefined;
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
  const accessRecords = orgId
    ? await db.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true },
      })
    : [];

  const accessSet = new Set(accessRecords.map((a) => a.appId));

  // Only return installed apps
  const data = allApps.filter((app) => accessSet.has(app.id));

  // The IdP base URL lives in QUIKIT_URL (server-side, required for OAuth).
  // Include it in the response so the switcher's "View all apps" link does
  // not depend on NEXT_PUBLIC_QUIKIT_URL being set at build time.
  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      // Per-user response — never share. Browser serves from cache for 30s,
      // tolerates 60s of staleness while revalidating in background.
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
}
