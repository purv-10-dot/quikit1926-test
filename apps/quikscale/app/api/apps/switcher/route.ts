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

  // Env-override map: if the deployment supplies a per-app URL via env, use
  // it instead of the DB's stored baseUrl. Lets local dev (.env.local with
  // localhost ports) run against a Neon DB whose App.baseUrl rows hold prod
  // URLs, without sending every "switch app" click to production.
  // Mirrors the launcher endpoint in apps/quikit/app/api/apps/launcher/route.ts.
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    quikscale: process.env.QUIKSCALE_URL,
    admin: process.env.ADMIN_URL,
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
  };
  const isDev = process.env.NODE_ENV !== "production";
  const devLocalhostFallbacks: Record<string, string> = {
    quikit: "http://localhost:3000",
    auth: "http://localhost:3001",
    admin: "http://localhost:3002",
    quikscale: "http://localhost:3003",
    quiktrack: "http://localhost:3004",
    quikvc: "http://localhost:3005",
    quikinfra: "http://localhost:3006",
    quiksocial: "http://localhost:3007",
  };
  function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
    const fromEnv = envBaseUrls[slug];
    if (fromEnv) return fromEnv;
    if (dbBaseUrl) return dbBaseUrl;
    if (isDev && devLocalhostFallbacks[slug]) return devLocalhostFallbacks[slug];
    return "";
  }

  // Only return installed apps, with baseUrl resolved against env first.
  const data = allApps
    .filter((app) => accessSet.has(app.id))
    .map((app) => ({ ...app, baseUrl: resolveBaseUrl(app.slug, app.baseUrl) }));

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
