import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES, HIDDEN_APP_SLUGS } from "@quikit/shared";

 /**
 * GET /api/apps/s witcher
 *
 * Returns the apps the current user can open from the in-app AppSwitcher (the
 * waffle grid in the header). Mirrors quikscale/quiktrack and the QuikIT
 * launcher (apps/quikit/app/api/apps/launcher/route.ts) so the switcher and the
 * portal never disagree. Queries the SHARED database directly — HRMS uses
 * @quikit/database now, so no cross-origin relay is needed.
 *
 * Visibility rule (identical to the launcher):
 *   1. The org must have OrgAppAccess.enabled = true for the app.
 *   2. If App.requiresOrgAdmin = true, the caller must be org/super admin.
 *   3. Org/Super admins see every provisioned app; everyone else needs an
 *      explicit UserAppAccess row.
 *   4. `quikit` (the launcher) is excluded — it's not a switch target.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin === true;
  let orgId = session.user.orgId;
  let memberRole = session.user.membershipRole;

  // Fall back to first active membership if orgId not in session.
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
    where: { status: { not: "disabled" }, slug: { notIn: ["quikit", ...HIDDEN_APP_SLUGS] } },
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

  // Env-override map: prefer a per-app URL from env over the DB's stored
  // baseUrl, so local dev (.env.local localhost ports) runs against a Neon DB
  // whose App.baseUrl rows hold prod URLs. Mirrors quikscale + the launcher,
  // and adds quikhrms.
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
    quiksupport: process.env.QUIKSUPPORT_URL,
    quikhrms: process.env.QUIKHRMS_URL,
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
    quiksupport: "http://localhost:3010",
    quikhrms: "http://localhost:3009",
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
    if (!isSuperAdmin && !memberIsAdmin && !userAppIds.has(app.id)) return false;
    return true;
  });

  const data = visibleApps.map((app) => ({
    ...app,
    baseUrl: resolveBaseUrl(app.slug, app.baseUrl),
    installed: true,
  }));

  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" } },
  );
}
