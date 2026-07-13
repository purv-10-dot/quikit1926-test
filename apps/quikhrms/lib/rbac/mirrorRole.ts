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

async function getCentralAppId(): Promise<string | null> {
  if (cachedCentralAppId) return cachedCentralAppId;
  const app = await prisma.app.findUnique({
    where: { slug: QUIKHRMS_APP_SLUG },
    select: { id: true },
  });
  cachedCentralAppId = app?.id ?? null;
  return cachedCentralAppId;
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
