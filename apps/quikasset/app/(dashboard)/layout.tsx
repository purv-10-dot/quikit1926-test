import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOrgId } from "@/lib/api/getOrgId";
import { ADMIN_TIER_ROLES } from "@quikit/shared";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAppRoles";
import { loadMyPermissions } from "@/lib/api/permissions";
import { DashboardShell } from "@/components/dashboard-shell";

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

  const orgId = await getOrgId(session.user.id);
  if (!orgId) redirect("/login?reason=no_org");

  const { adminRoleId, memberRoleId } = await seedAllDefaultRoles(orgId);

  const isAdminTier =
    session.user.isSuperAdmin === true ||
    ADMIN_TIER_ROLES.has(String(session.user.membershipRole ?? ""));
  await ensureUserOnRole(session.user.id, orgId, isAdminTier ? adminRoleId : memberRoleId);

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
