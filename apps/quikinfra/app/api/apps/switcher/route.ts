import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db as dbCentral } from "@quikit/database";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { authOptions } from "@/lib/auth";

/**
 * GET /api/apps/switcher
 *
 * Returns the list of apps the current user can see in the in-app AppSwitcher
 * (the grid dropdown in the header). This MUST match what the QuikIT launcher
 * (`/apps`) and QuikScale's switcher show for the same user + active org, so
 * the switcher and the portal never disagree. Queries the shared registry
 * database directly (no cross-origin needed).
 *
 * Visibility rule (mirrors apps/quikscale/app/api/apps/switcher/route.ts):
 *   1. The org must have OrgAppAccess.enabled = true for the app (provisioning)
 *   2. If App.requiresOrgAdmin = true, the caller's membership role must be in
 *      ADMIN_TIER_ROLES (super_admin/org_admin) OR they're a platform super admin
 *   3. Org Admin / Super Admin see EVERY provisioned app; everyone else needs an
 *      explicit UserAppAccess row (UserAppAccess is an optional override, not a
 *      blanket gate)
 *   4. `quikit` itself is excluded — it's the launcher, not a switch target
 *
 * NOTE: inside consumer apps `session.user.isSuperAdmin` is forced to false
 * (apps don't inherit super-admin), so the admin path is driven by
 * `membershipRole` via ADMIN_TIER_ROLES.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as
    | { id?: string; isSuperAdmin?: boolean; orgId?: string; membershipRole?: string }
    | undefined;
  const userId = user?.id;
  if (!session?.user || !userId) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const isSuperAdmin = user.isSuperAdmin === true;
  let orgId = user.orgId;
  let memberRole = user.membershipRole;

  // Fall back to first active membership if orgId not in session.
  if (!orgId) {
    const membership = await dbCentral.orgMember.findFirst({
      where: { userId, status: "active" },
      select: { orgId: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    orgId = membership?.orgId ?? undefined;
    memberRole = membership?.role ?? memberRole;
  }

  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ""));

  // Catalog (active only). Exclude `quikit` — it's the launcher itself.
  const allApps = await dbCentral.app.findMany({
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

  // Org-level entitlement: SPARSE storage, DEFAULT-OFF. Only apps with an
  // OrgAppAccess row enabled:true are provisioned for this org.
  const orgAllows = orgId
    ? await dbCentral.orgAppAccess.findMany({
        where: { orgId, enabled: true },
        select: { appId: true },
      })
    : [];
  const orgAllowedAppIds = new Set(
    (orgAllows as Array<{ appId: string }>).map((a) => a.appId),
  );

  // Per-user app access. Presence = explicitly assigned; absence only blocks
  // non-admin tiers (org admins / super admins get full-org visibility).
  const userAccess = orgId
    ? await dbCentral.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true },
      })
    : [];
  const userAppIds = new Set(
    (userAccess as Array<{ appId: string }>).map((u) => u.appId),
  );

  // Env-override map: if the deployment supplies a per-app URL via env, use
  // it instead of the DB's stored baseUrl. Lets local dev (.env.local with
  // localhost ports) run against a Neon DB whose App.baseUrl rows hold prod
  // URLs, without sending every "switch app" click to production.
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    quikscale: process.env.QUIKSCALE_URL,
    admin: process.env.ADMIN_URL,
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
    quikcrm: process.env.QUIKCRM_URL,
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
    quikcrm: "http://localhost:3008",
  };
  function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
    const fromEnv = envBaseUrls[slug];
    if (fromEnv) return fromEnv;
    if (dbBaseUrl) return dbBaseUrl;
    if (isDev && devLocalhostFallbacks[slug]) return devLocalhostFallbacks[slug];
    return "";
  }

  // Visibility filter — identical rule to the launcher / quikscale switcher.
  type CatalogApp = {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    iconUrl: string | null;
    baseUrl: string | null;
    status: string;
    requiresOrgAdmin: boolean;
  };
  const visibleApps = (allApps as CatalogApp[]).filter((app) => {
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
    installed: true, // visibility implies installed under the new rule
  }));

  // Surface QUIKIT_URL so the switcher's "View all apps" link doesn't
  // need NEXT_PUBLIC_QUIKIT_URL baked in at build time.
  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    },
  );
}
