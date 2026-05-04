import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

/**
 * GET /api/apps/launcher
 *
 * Returns the apps the current user can see in their active org's launcher.
 *
 * Active org resolution order:
 *   1. ?orgId=… query param (caller asserts which org they want — we still
 *      validate the user has active membership). This avoids the JWT race
 *      when the launcher dropdown switches orgs (NextAuth `update()` cookie
 *      hasn't been re-issued yet by the time this endpoint fires).
 *   2. session.user.orgId (set by jwt callback on initial login)
 *   3. user's first active OrgMember by createdAt (defensive fallback)
 *
 * Visibility rule (post 2026-05-04 role refactor):
 *   1. The org must have OrgAppAccess.enabled = true for the app
 *   2. If App.requiresOrgAdmin = true, the user's OrgMember.role must be in
 *      ADMIN_TIER_ROLES (super_admin/org_admin) OR User.isSuperAdmin must be true
 *   3. UserAppAccess is now an OPTIONAL override — its presence elevates
 *      the user's per-app role; its absence no longer blocks visibility
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin === true;
  const requestedOrgId = req.nextUrl.searchParams.get("orgId");

  // Resolve active orgId — query param > session > first active membership.
  // For query-param path, validate the user actually has active membership
  // (don't trust the client to assert org access).
  let orgId: string | undefined;
  let memberRole: string | undefined;

  if (requestedOrgId) {
    const membership = await db.orgMember.findFirst({
      where: { userId, orgId: requestedOrgId, status: "active" },
      select: { orgId: true, role: true },
    });
    if (!membership) {
      return NextResponse.json(
        { success: false, error: "No active membership in requested org" },
        { status: 403 },
      );
    }
    orgId = membership.orgId;
    memberRole = membership.role;
  } else {
    orgId = session.user.orgId;
    memberRole = session.user.membershipRole;
    if (!orgId) {
      const membership = await db.orgMember.findFirst({
        where: { userId, status: "active" },
        select: { orgId: true, role: true },
        orderBy: { createdAt: "asc" },
      });
      orgId = membership?.orgId ?? undefined;
      memberRole = membership?.role ?? memberRole;
    }
  }

  const memberIsAdmin = isSuperAdmin || ADMIN_TIER_ROLES.has(String(memberRole ?? ""));

  // Apps in catalog (active only)
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
      requiresOrgAdmin: true,
    },
    orderBy: { name: "asc" },
  });

  // Org-level entitlement uses SPARSE storage with DEFAULT-OFF semantics:
  //   - No OrgAppAccess row for (orgId, appId) → app is hidden (default off)
  //   - Row with enabled:true → app explicitly granted by super-admin
  //   - Row with enabled:false → legacy/redundant (treated same as no row)
  //
  // Platform super-admins (User.isSuperAdmin) bypass this gate and see every
  // app (still subject to the per-app requiresOrgAdmin role check below) so
  // they can still operate on freshly-created orgs.
  const orgAllows = orgId && !isSuperAdmin
    ? await db.orgAppAccess.findMany({
        where: { orgId, enabled: true },
        select: { appId: true },
      })
    : [];
  const orgAllowedAppIds = new Set(orgAllows.map((a) => a.appId));

  // Optional per-user overrides (currently unused for visibility — present
  // role elevates the per-app role. Future: explicit deny rows would block.)
  const userOverrides = orgId
    ? await db.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true, role: true },
      })
    : [];
  const userRoleOverride = new Map(userOverrides.map((u) => [u.appId, u.role]));

  // Visibility filter (sparse storage — allow-list semantics, default-off):
  //   - super-admin: bypasses entitlement gate, still subject to role check
  //   - other users: app must have explicit OrgAppAccess { enabled:true } row
  const visibleApps = allApps.filter((app) => {
    if (!isSuperAdmin && !orgAllowedAppIds.has(app.id)) return false;
    if (app.requiresOrgAdmin && !memberIsAdmin) return false;
    return true;
  });

  // Env-override map: if the deployment supplies a per-app URL via env, use
  // it instead of the DB's stored baseUrl. Lets local dev (.env.local with
  // localhost ports) run against a Neon DB whose App.baseUrl rows hold prod
  // URLs, without redirecting every launch to production.
  const envBaseUrls: Record<string, string | undefined> = {
    quikit: process.env.QUIKIT_URL,
    quikscale: process.env.QUIKSCALE_URL,
    admin: process.env.ADMIN_URL,
    quikvc: process.env.QUIKVC_URL,
    quikconstruction: process.env.QUIKCONSTRUCTION_URL,
  };

  const data = visibleApps.map((app) => ({
    ...app,
    baseUrl: envBaseUrls[app.slug] ?? app.baseUrl,
    installed: true, // visibility implies installed under the new rule
    role: userRoleOverride.get(app.id) ?? (memberIsAdmin ? "admin" : "member"),
  }));

  // Authoritative IdP URL for the AppSwitcher's "View all apps" link —
  // sourced server-side from QUIKIT_URL so clients don't have to rely on
  // NEXT_PUBLIC_QUIKIT_URL being baked into their bundle at build time.
  // On quikit itself, fall back to NEXTAUTH_URL (same host).
  const quikitUrl =
    process.env.QUIKIT_URL ?? process.env.NEXTAUTH_URL ?? null;

  return NextResponse.json(
    { success: true, data, quikitUrl },
    {
      // No client cache — org switching from the launcher dropdown must
      // hit this endpoint each time so the tile list reflects the active
      // org's entitlements. Per-user, sensitive, dynamically scoped → never
      // safe to cache.
      headers: { "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0" },
    },
  );
}
