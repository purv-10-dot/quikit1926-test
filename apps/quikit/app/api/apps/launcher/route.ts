import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { ADMIN_TIER_ROLES } from "@quikit/shared";

/**
 * GET /api/apps/launcher
 *
 * Returns the apps the current user can see in their active org's launcher.
 *
 * Visibility rule (post 2026-05-04 role refactor):
 *   1. The org must have OrgAppAccess.enabled = true for the app
 *   2. If App.requiresOrgAdmin = true, the user's OrgMember.role must be in
 *      ADMIN_TIER_ROLES (super_admin/org_admin) OR User.isSuperAdmin must be true
 *   3. UserAppAccess is now an OPTIONAL override — its presence elevates
 *      the user's per-app role; its absence no longer blocks visibility
 *
 * Falls back to first active membership if session has no orgId yet.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const isSuperAdmin = session.user.isSuperAdmin === true;

  // Resolve active orgId (session preferred; fall back to first active membership)
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

  // Org-level entitlement: which apps is THIS org allowed to see?
  const orgEntitlements = orgId
    ? await db.orgAppAccess.findMany({
        where: { orgId, enabled: true },
        select: { appId: true },
      })
    : [];
  const orgEntitledAppIds = new Set(orgEntitlements.map((e) => e.appId));

  // Optional per-user overrides (currently unused for visibility — present
  // role elevates the per-app role. Future: explicit deny rows would block.)
  const userOverrides = orgId
    ? await db.userAppAccess.findMany({
        where: { userId, orgId },
        select: { appId: true, role: true },
      })
    : [];
  const userRoleOverride = new Map(userOverrides.map((u) => [u.appId, u.role]));

  // Visibility filter
  const visibleApps = allApps.filter((app) => {
    if (!orgEntitledAppIds.has(app.id)) return false;
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
      // Per-user response — never share. Browser serves from cache for 30s,
      // tolerates 60s of staleness while revalidating in background.
      // See docs/plans/P1-2-cache-control-headers.md.
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    },
  );
}
