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

  // Apps in catalog (active only). Exclude `quikit` itself — it IS the
  // launcher; showing it as a tenant tile is nonsensical.
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

  // Org-level entitlement uses SPARSE storage with DEFAULT-OFF semantics:
  //   - No OrgAppAccess row for (orgId, appId) → app is hidden (default off)
  //   - Row with enabled:true → app explicitly granted by super-admin
  //   - Row with enabled:false → treated same as no row
  //
  // Super admins are NOT bypassed any more — they see exactly what the
  // selected org is provisioned for. Managing the access matrix happens
  // via /organizations/[id] (super-admin UI), not by overloading the
  // launcher. When the selected org has 0 provisioned apps, the launcher
  // renders its existing empty state and points the super-admin at the
  // super-admin panel.
  const orgAllows = orgId
    ? await db.orgAppAccess.findMany({
        where: { orgId, enabled: true },
        select: { appId: true },
      })
    : [];
  const orgAllowedAppIds = new Set(orgAllows.map((a) => a.appId));

  // Per-user app access (FRD FR-OA-002 / FR-OA-003).
  //   - Map entry → user has been explicitly assigned this app; the value
  //     is their per-app role ("admin" for App Admin, "member" for User).
  //   - Map miss → user is NOT assigned the app and should not see it,
  //     UNLESS they're an Org Admin or Super Admin (full-org visibility).
  const userAccess = orgId
    ? await db.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true, role: true },
      })
    : [];
  const userAppRoles = new Map(userAccess.map((u) => [u.appId, u.role]));

  // Visibility (FRD-compliant, post-onboarding-FRD):
  //   - Every user (including super admin) only sees apps the SELECTED ORG
  //     is provisioned for (OrgAppAccess.enabled = true). Super admin
  //     manages the access matrix via /organizations/[id] in super-admin UI.
  //   - Org Admin → sees every provisioned app in the selected org
  //   - App Admin / User (Member) → only provisioned apps where the user
  //     has an explicit UserAppAccess row (FR-OA-002 / FR-OA-003)
  //   - `requiresOrgAdmin` apps (e.g. Admin Portal) still gate on the
  //     caller's membership role within the selected org.
  const visibleApps = allApps.filter((app) => {
    if (!orgAllowedAppIds.has(app.id)) return false;
    if (app.requiresOrgAdmin && !memberIsAdmin) return false;
    // Per-user scoping for non-admin tiers. Org admin / super admin still
    // see every provisioned app — others need an explicit UserAppAccess row.
    if (!isSuperAdmin && !memberIsAdmin && !userAppRoles.has(app.id)) {
      return false;
    }
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
    quiktrack: process.env.QUIKTRACK_URL,
    quikvc: process.env.QUIKVC_URL,
    quikinfra: process.env.QUIKINFRA_URL,
    quiksocial: process.env.QUIKSOCIAL_URL,
    quikcrm: process.env.QUIKCRM_URL,
  };

  // Dev-only safety net. If the env var isn't set AND the DB's baseUrl is
  // empty/missing, the launcher tile would set `window.location.href = ""`
  // which silently reloads /apps. Map each app slug to its package.json dev
  // port so the launcher always has a valid target on a fresh local clone.
  // Production deployments must set the env vars (or have valid DB rows);
  // we never inject localhost into a prod response.
  const isDev = process.env.NODE_ENV !== "production";
  const devLocalhostFallbacks: Record<string, string> = {
    quikit: "http://localhost:3000",
    auth: "http://localhost:3001",
    admin: "http://localhost:3002",
    quikscale: "http://localhost:3003",
    quiktrack: "http://localhost:3004",
    quikinfra: "http://localhost:3006",
    quikvc: "http://localhost:3005",
    quikcrm: "http://localhost:3008",
  };

  /**
   * Resolution order: explicit env override → DB-stored baseUrl → (dev only)
   * localhost fallback. `||` is used instead of `??` so empty strings — which
   * older seed scripts left behind when they ran without env vars — fall
   * through instead of being treated as a valid value.
   */
  function resolveBaseUrl(slug: string, dbBaseUrl: string | null | undefined): string {
    const fromEnv = envBaseUrls[slug];
    if (fromEnv) return fromEnv;
    if (dbBaseUrl) return dbBaseUrl;
    if (isDev && devLocalhostFallbacks[slug]) return devLocalhostFallbacks[slug];
    return "";
  }

  const data = visibleApps.map((app) => ({
    ...app,
    baseUrl: resolveBaseUrl(app.slug, app.baseUrl),
    installed: true, // visibility implies installed under the new rule
    role: userAppRoles.get(app.id) ?? (memberIsAdmin ? "admin" : "member"),
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
