/**
 * Mirror an assigned HRMS role onto the central `quikit.UserAppAccess.role`
 * column — the value the Admin Portal reads and displays.
 *
 * HRMS keys its own role rows (`HrmsUserAppRole`) by `Employee.id` and stores
 * the app SLUG in `HrmsAppRole.appId`, whereas the central `UserAppAccess` is
 * keyed by `auth.User.id` + the central `App.id` (a cuid). This helper bridges
 * the two: `Employee.id → Employee.authUserId` and `slug "quikhrms" → App.id`,
 * then delegates to the shared `mirrorAppRoleToCentral`.
 *
 * Employees not yet linked to a login account (`authUserId` null) have no
 * central access row and are skipped.
 */
import { prisma } from "@/lib/prisma";
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";

const QUIKHRMS_APP_SLUG = "quikhrms";

let cachedCentralAppId: string | null = null;

export async function getCentralAppId(): Promise<string | null> {
  if (cachedCentralAppId) return cachedCentralAppId;
  const app = await prisma.app.findUnique({
    where: { slug: QUIKHRMS_APP_SLUG },
    select: { id: true },
  });
  cachedCentralAppId = app?.id ?? null;
  return cachedCentralAppId;
}

/**
 * Read the role the Admin Portal's Members Invite/Edit flow has assigned this
 * central user for HRMS (`quikit.UserAppAccess.role`), if any. Used as a
 * first-login signal during JIT provisioning (see provisioning.ts) so an
 * admin-chosen "Role in QuikHRMS" isn't silently dropped in favor of the
 * coarse org-membership-based default. Returns null if no central access row
 * exists yet for this user+app (nothing assigned, or not synced — see the
 * module doc comment above about the two systems' different keys).
 */
export async function getCentralHrmsRole(orgId: string, authUserId: string): Promise<string | null> {
  const appId = await getCentralAppId();
  if (!appId) return null;
  const access = await prisma.userAppAccess.findFirst({
    where: { orgId, userId: authUserId, appId },
    select: { role: true },
  });
  return access?.role ?? null;
}

/**
 * Sync `UserAppAccess.role` for one or more HRMS employees to `roleName`.
 * No-op when `roleName` is empty (a cleared role leaves the mirror as-is —
 * the column is NOT NULL) or when no employees resolve to a linked login.
 */
export async function mirrorHrmsRolesToCentral(
  orgId: string,
  employeeIds: string[],
  roleName: string | null | undefined,
): Promise<void> {
  if (!roleName || !roleName.trim() || employeeIds.length === 0) return;
  const appId = await getCentralAppId();
  if (!appId) return;

  const employees = await prisma.employee.findMany({
    where: { id: { in: employeeIds }, orgId },
    select: { authUserId: true },
  });

  for (const e of employees) {
    if (!e.authUserId) continue;
    await mirrorAppRoleToCentral(prisma, {
      orgId,
      userId: e.authUserId,
      appId,
      roleName,
    });
  }
}
