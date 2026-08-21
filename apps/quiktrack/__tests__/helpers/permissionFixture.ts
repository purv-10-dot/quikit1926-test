import { mockDb } from "./mockDb";

/**
 * One in-memory permission state that answers EVERY Prisma call made by both
 * `lib/api/permissions.ts` (userCan / userCanInProject / loadMyPermissions /
 * hasAdminAccess) and `lib/api/resolvePermissions.ts`.
 *
 * Both sides reading the same fixture is what makes the agreement test
 * meaningful: if the two disagree, it is a precedence difference, not a
 * difference in how the test set them up.
 */

export const USER = "user_1";
export const ORG = "org_1";
export const PROJECT = "proj_1";
export const PROJECT_KEY = "WST";
export const APP_ID = "app_quiktrack";

export interface PermissionFixture {
  /** OrgMember.role for (USER, ORG). null = not an active member of the org. */
  orgRole?: string | null;
  /** Holds the QuikTrack app-admin role (QtAppRole isSystem + name "admin"). */
  appAdmin?: boolean;
  /** App-wide role grants as `Resource:action`. */
  appRoleGrants?: string[];
  /** Per-user extras (org-scoped, additive everywhere) as `Resource:action`. */
  extras?: string[];
  /** Project role name in PROJECT. null/undefined = no assignment. */
  projectRoleName?: string | null;
  /** Grants on that project role as `Resource:action`. */
  projectRoleGrants?: string[];
  /** A QtProjectMember row exists for USER in PROJECT. */
  isMember?: boolean;
  /** PROJECT resolves org-scoped and non-deleted. false => cross-org/deleted. */
  projectExists?: boolean;
}

function key(resource: unknown, action: unknown): string {
  return `${String(resource)}:${String(action)}`;
}

/** Wire mockDb to answer from `f`. Call after resetMockDb(). */
export function installPermissionFixture(f: PermissionFixture): void {
  const appRoleGrants = new Set(f.appRoleGrants ?? []);
  const extras = new Set(f.extras ?? []);
  const projectRoleGrants = new Set(f.projectRoleGrants ?? []);
  const projectExists = f.projectExists ?? true;

  mockDb.app.findUnique.mockResolvedValue({ id: APP_ID } as never);

  // hasAdminAccess → org tier
  mockDb.orgMember.findFirst.mockResolvedValue(
    (f.orgRole ? { role: f.orgRole } : null) as never,
  );

  // isQuikTrackAppAdmin
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(
    (f.appAdmin ? { id: "uar_1" } : null) as never,
  );

  // loadMyPermissions → app-wide role + its grants
  mockDb.qtUserAppRole.findMany.mockResolvedValue(
    (appRoleGrants.size === 0 && !f.appAdmin
      ? []
      : [
          {
            role: {
              id: "role_1",
              name: f.appAdmin ? "admin" : "Member",
              isSystem: !!f.appAdmin,
              permissions: Array.from(appRoleGrants).map((k) => {
                const [resource, action] = k.split(":");
                return { resource, action };
              }),
              navigations: [],
            },
          },
        ]) as never,
  );

  // loadMyPermissions → per-user extras
  mockDb.qtUserPermissionExtra.findMany.mockResolvedValue(
    Array.from(extras).map((k) => {
      const [resource, action] = k.split(":");
      return { resource, action };
    }) as never,
  );

  // userCan / userCanInProject → single-pair extra lookup
  mockDb.qtUserPermissionExtra.findFirst.mockImplementation((async (args: {
    where?: { resource?: string; action?: string };
  }) =>
    extras.has(key(args?.where?.resource, args?.where?.action))
      ? { id: "extra_1" }
      : null) as never);

  // userCan → app-wide role grant lookup
  mockDb.qtRolePermission.findFirst.mockImplementation((async (args: {
    where?: { resource?: string; action?: string };
  }) =>
    appRoleGrants.has(key(args?.where?.resource, args?.where?.action))
      ? { id: "rp_1" }
      : null) as never);

  // userCanInProject → project role grant lookup
  mockDb.qtProjectRolePermission.findFirst.mockImplementation((async (args: {
    where?: { resource?: string; action?: string };
  }) =>
    projectRoleGrants.has(key(args?.where?.resource, args?.where?.action))
      ? { id: "prp_1" }
      : null) as never);

  // The project-role assignment. Returns the union of the fields the two
  // consumers select (Prisma's `select` is not modelled by the deep mock).
  mockDb.qtProjectUserRole.findUnique.mockResolvedValue(
    (f.projectRoleName
      ? {
          projectRoleId: "prole_1",
          projectRole: {
            name: f.projectRoleName,
            permissions: Array.from(projectRoleGrants).map((k) => {
              const [resource, action] = k.split(":");
              return { resource, action };
            }),
          },
        }
      : null) as never,
  );

  // spaceAdminProjectIds (called by loadMyPermissions)
  mockDb.qtProjectUserRole.findMany.mockResolvedValue(
    (f.projectRoleName === "Space Admin" ? [{ projectId: PROJECT }] : []) as never,
  );

  // Project resolution: id OR projectKey, org-scoped, non-deleted.
  mockDb.qtProject.findFirst.mockImplementation((async (args: {
    where?: {
      orgId?: string;
      isDeleted?: boolean;
      OR?: Array<{ id?: string; projectKey?: string }>;
    };
  }) => {
    if (!projectExists) return null;
    // Enforce the org scope and soft-delete filter for real, so a cross-org
    // lookup misses through the same code path production would.
    if (args?.where?.orgId !== ORG) return null;
    if (args?.where?.isDeleted !== false) return null;
    const ref = args?.where?.OR?.[0]?.id;
    return ref === PROJECT || ref === PROJECT_KEY ? { id: PROJECT } : null;
  }) as never);

  mockDb.qtProjectMember.findFirst.mockResolvedValue(
    (f.isMember ? { id: "pm_1" } : null) as never,
  );
}
