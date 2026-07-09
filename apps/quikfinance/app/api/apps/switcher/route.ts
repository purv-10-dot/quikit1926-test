import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@quikit/database";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

/**
 * GET /api/apps/switcher
 *
 * Returns the apps the current user can see in the in-app AppSwitcher (the grid
 * dropdown in the header). Mirrors the QuikIT launcher's visibility rule so the
 * switcher and the launcher never disagree.
 *
 * NOTE: this queries the CENTRAL platform DB (`@quikit/database`) — NOT the
 * finance query-builder at `@/lib/db`. App/org/membership live in the shared
 * `quikit` schema.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin === true;
  let orgId = session.user.orgId;
  let memberRole = session.user.membershipRole;

  if (!orgId) {
    const membership = await db.orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.orgId ?? undefined;
    memberRole = membership?.role ?? memberRole;
  }

  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ""));

  // Catalog (active only). Exclude `quikit` — it's the launcher itself.
  const allApps = await db.app.findMany({
    where: { status: { not: "disabled" }, slug: { not: "quikit" } },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      iconUrl: true,
      baseUrl: true,
      status: true,
      requiresOrgAdmin: true,
    },
    orderBy: { name: "asc" },
  });

  const orgAllows = orgId
    ? await db.orgAppAccess.findMany({
        where: { orgId, enabled: true },
        select: { appId: true },
      })
    : [];
  const orgAllowedAppIds = new Set(orgAllows.map((a) => a.appId));

  const userAccess = orgId
    ? await db.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true },
      })
    : [];
  const userAppIds = new Set(userAccess.map((u) => u.appId));

  // Env-override map for per-app URLs (local dev points at localhost ports).
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    quikscale: process.env.QUIKSCALE_URL,
    quikasset: process.env.QUIKASSET_URL,
    admin: process.env.ADMIN_URL,
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
    quikcrm: process.env.QUIKCRM_URL,
    quikfinance: process.env.QUIKFINANCE_URL,
  };
  const isDev = process.env.NODE_ENV !== "production";
  const devLocalhostFallbacks: Record<string, string> = {
    quikit: "http://localhost:3000",
    auth: "http://localhost:3001",
    admin: "http://localhost:3002",
    quikscale: "http://localhost:3003",
    quikasset: "http://localhost:3012",
    quiktrack: "http://localhost:3004",
    quikvc: "http://localhost:3005",
    quikinfra: "http://localhost:3006",
    quiksocial: "http://localhost:3007",
    quikcrm: "http://localhost:3008",
    quikfinance: "http://localhost:3013",
  };
  function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
    const fromEnv = envBaseUrls[slug];
    if (fromEnv) return fromEnv;
    if (dbBaseUrl) return dbBaseUrl;
    if (isDev && devLocalhostFallbacks[slug]) return devLocalhostFallbacks[slug];
    return "";
  }

  const visibleApps = allApps.filter((app) => {
    if (!orgAllowedAppIds.has(app.id)) return false;
    if (app.requiresOrgAdmin && !memberIsAdmin) return false;
    if (!isSuperAdmin && !memberIsAdmin && !userAppIds.has(app.id)) {
      return false;
    }
    return true;
  });

  const data = visibleApps.map((app) => ({
    ...app,
    baseUrl: resolveBaseUrl(app.slug, app.baseUrl),
    installed: true,
  }));
  const quikitUrl = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
  );
}
