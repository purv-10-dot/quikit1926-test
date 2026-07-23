import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { requireAppAccess } from "@quikit/auth/app-access";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { seedAllDefaultRoles, ensureDefaultRoleIfNone } from "@/lib/api/seedAppRoles";
import { loadMyPermissions } from "@/lib/api/permissions";
import { DashboardShell } from "@/components/dashboard-shell";

const APP_SLUG = "quikasset";

/**
 * Authenticated shell. Server component so it can:
 *   1. enforce the session + active-org/app-access gate,
 *   2. idempotently seed this org's admin/Member roles (cached per process),
 *   3. ensure the signed-in user is assigned a role (admin tier → admin,
 *      everyone else → the default Member role),
 *   4. compute the user's effective permission set to drive sidebar visibility.
 */
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  // App-access gate FIRST. A signed-in user who isn't granted QuikAsset is
  // redirected to the landing page with the access-denied popup markers
  // (`/?reason=no_app_access&…`), exactly like quiktrack. Without this,
  // getOrgId() below returns null for such a user → redirect to /login → the
  // /login page bounces the still-authenticated user back to /dashboard →
  // infinite redirect loop (ERR_TOO_MANY_REDIRECTS).
  await requireAppAccess({
    userId: session.user.id,
    orgId: session.user.orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: session.user.isSuperAdmin === true,
    memberRole: session.user.membershipRole,
    homeUrl: process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL,
  });

  const orgId = await getOrgId(session.user.id);
  if (!orgId) redirect("/login?reason=no_org");

  const { adminRoleId, memberRoleId } = await seedAllDefaultRoles(orgId);

  const isAdminTier =
    session.user.isSuperAdmin === true ||
    ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
  // First-time bootstrap ONLY: assign a default role when the user has no
  // QuikAsset role yet. Must NOT override/duplicate a role a manager already
  // assigned (previously this re-added Member every load for non-admin-tier
  // users, reverting explicit promotions — the role-reversion bug).
  await ensureDefaultRoleIfNone(session.user.id, orgId, isAdminTier ? adminRoleId : memberRoleId);

  const perms = await loadMyPermissions(session.user.id, orgId);

  const displayName =
    [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") ||
    session.user.name ||
    session.user.email ||
    "User";

  return (
    <DashboardShell
      permissions={perms.permissions}
      isAdmin={perms.isAdmin}
      roleName={perms.roleName}
      displayName={displayName}
      email={session.user.email ?? null}
    >
      {children}
    </DashboardShell>
  );
}
