import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ADMIN_TIER_ROLES, HIDDEN_APP_SLUGS } from "@quikit/shared";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/apps/switcher
 *
 * Apps the current user can see in the in-app AppSwitcher (the grid dropdown
 * in the header). This MUST match what the QuikIT launcher shows for the same
 * user + active org (apps/quikit/app/api/apps/launcher/route.ts), or the
 * switcher and the portal disagree about what the user has.
 *
 * Visibility rule — mirrors the launcher exactly:
 *   1. The org must have OrgAppAccess.enabled = true for the app (provisioning
 *      is SPARSE and DEFAULT-OFF — no row means not provisioned).
 *   2. If App.requiresOrgAdmin, the caller must be admin-tier.
 *   3. Org/super admins see EVERY provisioned app; everyone else needs an
 *      explicit UserAppAccess row.
 *   4. `quikit` (the launcher) and HIDDEN_APP_SLUGS are never switch targets.
 *
 * Previously this route applied only rule 3's UserAppAccess check against the
 * raw App catalog — no org provisioning gate, no requiresOrgAdmin gate, no
 * hidden-slug filter — so it could advertise apps the launcher hides, and org
 * admins (who legitimately hold no UserAppAccess rows) saw an empty switcher.
 *
 * NOTE: inside consumer apps `session.user.isSuperAdmin` is forced to false
 * (apps don't inherit super-admin), so the admin path is driven by
 * `membershipRole` via ADMIN_TIER_ROLES.
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

  // Fall back to the first active membership when the session carries no org.
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

  // Env-override map: a deployment can supply per-app URLs so local dev (with
  // localhost ports) can run against a Neon DB whose App.baseUrl rows hold
  // deployed URLs. Mirrors the launcher.
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    admin: process.env.ADMIN_URL,
    quikscale: process.env.QUIKSCALE_URL,
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
    quikcrm: process.env.QUIKCRM_URL,
    quikcrmexpress: process.env.QUIKCRMEXPRESS_URL,
    quikhrms: process.env.QUIKHRMS_URL,
    quiksupport: process.env.QUIKSUPPORT_URL,
    quikasset: process.env.QUIKASSET_URL,
    quikfinance: process.env.QUIKFINANCE_URL,
    quiklms: process.env.QUIKLMS_URL,
    quikchat: process.env.QUIKCHAT_URL,
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
    quikhrms: "http://localhost:3009",
    quiksupport: "http://localhost:3010",
    quikchat: "http://localhost:3011",
    quikasset: "http://localhost:3012",
    quikfinance: "http://localhost:3013",
    quiklms: "http://localhost:3016",
    quikcrmexpress: "http://localhost:3017",
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
    installed: true, // visibility implies installed under the current rule
  }));

  const quikitUrl = process.env.QUIKIT_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      // Per-user, dynamically scoped — never shared across users.
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
}
