/**
 * Central user repository (Step E).
 *
 * Replaces the legacy `cn_users`-backed `listUsers` / `findUserById` /
 * `softDeleteUser` / `updateUser` with versions that compose user data
 * entirely from central + v2 tables:
 *
 *   auth.User              — identity (id, email, firstName, lastName)
 *   quikit.OrgMember       — org membership, status, invite tokens
 *   app_quikinfra.User_profiles — QuikInfra-specific profile fields
 *   app_quikinfra.UserAppRole + CnAppRole — current v2 role
 *   app_quikinfra.CnUserPermissionExtra — revoke rows (still surfaced
 *     by the API layer's response-builder, not by this repo)
 *
 * The returned `id` is now `auth.User.id` (NOT `cn_users.id`). The
 * frontend just passes it through to PATCH/DELETE; the API endpoints
 * already accept the auth user id (we'll update them next).
 *
 * Once Step F finishes and nothing else writes/reads `cn_users`, the
 * legacy repository can be deleted.
 */

import { db } from "@/lib/db";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";

const INVITATION_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours

/** Same shape as the legacy `UserRecord` so the API responses stay identical. */
export interface CentralUserRecord {
  id: string;                 // auth.User.id (the new identifier)
  orgId: string;
  email: string;
  username: string;           // derived from email local-part
  fullName: string;           // firstName + " " + lastName
  firstName: string;
  lastName: string;
  mobile: string | null;
  department: string | null;
  mobileAccessEnabled: boolean;
  userType: string;           // mapped from CnAppRole.name (ADMIN/HO_USER/etc.)
  roleKey: string;            // CnAppRole.name (lowercase)
  /**
   * quikit.OrgMember.role — the CENTRAL membership tier (org_admin /
   * admin / super_admin for the org's own owner; "member" for everyone
   * invited via the app). Distinct from `roleKey` (the app-level role).
   * The UI uses this to tell a *central* admin apart from an invited
   * sub-admin who merely holds the app "admin" role.
   */
  membershipRole: string;
  modulesAssigned: string[];  // empty here; API layer overrides from revokes
  projectsAssigned: string[]; // empty here; API layer overrides from CnUserProjectAccess
  status: string;             // OrgMember.status
  lastLoginAt: string | null;
  inviteToken: string | null;
  inviteTokenExpires: string | null;
  invitedAt: string;
  invitedByName: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
  permissionMatrix: Record<string, Record<string, boolean>> | null;
}

function roleNameToUserType(roleName: string | undefined | null): string {
  switch ((roleName ?? "").toLowerCase()) {
    case "admin":
      return "ADMIN";
    case "ho_user":
      return "HO_USER";
    case "site_admin":
      return "SITE_ADMIN";
    case "user":
      return "USER";
    default:
      return "USER";
  }
}

interface CentralRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  lastSignInAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  // OrgMember fields (filtered by orgId)
  orgMember?: {
    status: string;
    role: string;
    invitationToken: string | null;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    createdBy: string | null;
  } | null;
  // User_profiles
  profile?: {
    firstName: string;
    lastName: string;
    department: string | null;
    mobile: string | null;
    mobileAccessEnabled: boolean;
  } | null;
  // CnUserAppRole → CnAppRole.name
  roleName?: string | null;
}

function buildRecord(row: CentralRow, orgId: string): CentralUserRecord {
  const profile = row.profile;
  const om = row.orgMember;
  const firstName = profile?.firstName ?? row.firstName ?? "";
  const lastName = profile?.lastName ?? row.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim();
  const expiresAt =
    om?.invitedAt && !om?.acceptedAt
      ? new Date(om.invitedAt.getTime() + INVITATION_TTL_MS).toISOString()
      : null;
  return {
    id: row.id,
    orgId,
    email: row.email,
    username: row.email.split("@")[0] ?? "user",
    fullName,
    firstName,
    lastName,
    mobile: profile?.mobile ?? null,
    department: profile?.department ?? null,
    mobileAccessEnabled: profile?.mobileAccessEnabled ?? false,
    userType: roleNameToUserType(row.roleName),
    roleKey: (row.roleName ?? "user").toLowerCase(),
    membershipRole: (om?.role ?? "member").toLowerCase(),
    modulesAssigned: [], // API layer overrides
    projectsAssigned: [], // API layer overrides
    status: om?.status ?? "active",
    lastLoginAt: row.lastSignInAt ? row.lastSignInAt.toISOString() : null,
    inviteToken: om?.invitationToken ?? null,
    inviteTokenExpires: expiresAt,
    invitedAt: om?.invitedAt ? om.invitedAt.toISOString() : row.createdAt.toISOString(),
    invitedByName: null, // hydrated below if needed via createdBy lookup
    acceptedAt: om?.acceptedAt ? om.acceptedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    permissionMatrix: null, // API layer overrides from revokes
  };
}

export interface ListUsersCentralOptions {
  /** Case-insensitive contains against email / firstName / lastName. */
  search?: string;
  /** Membership status view. Omit (or "all") to include active + inactive. */
  status?: "active" | "inactive" | "all";
  /** Server sort — whitelisted by the caller. */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** Pagination — pushed down to Prisma. */
  take?: number;
  skip?: number;
}

/**
 * Shared `where` for {@link listUsersCentral} + {@link countUsersCentral}.
 * Returns null when the QuikInfra App registry row is missing so both
 * callers fail closed (empty list / zero count) instead of exposing every
 * org member.
 */
async function buildUsersCentralWhere(
  orgId: string,
  opts: Pick<ListUsersCentralOptions, "search" | "status">,
): Promise<Record<string, unknown> | null> {
  // List ONLY users with an EXPLICIT QuikInfra grant — a quikit.UserAppAccess
  // row for the QuikInfra app. This is the per-user, per-app grant written by
  // the Admin Portal's "App Access" toggle and by the QuikInfra invite flow.
  // Mirrors QuikScale (user.appRoles.some(role.appId)) and QuikTrack
  // (userAppAccess for their appId) exactly.
  //
  // Deliberately NOT included:
  //   • org-admin / super-admin membership — an org admin can OPEN any app via
  //     the access-gate bypass, but that is NOT an explicit grant, so they do
  //     not surface here unless they were also granted the app directly.
  //   • a bare CnUserAppRole — an app-role assignment is not an access grant;
  //     the gate ignores it, so a stray/orphaned Cn-role must not list a user.
  const appId = await getQuikInfraAppId();
  if (!appId) return null;
  const q = (opts.search ?? "").trim();
  const where: Record<string, unknown> = {
    orgId,
    user: { appAccess: { some: { orgId, appId } } },
  };
  if (opts.status === "active") where.status = "active";
  else if (opts.status === "inactive") where.status = "inactive";
  // "all" / undefined → no status filter (both active + inactive).
  if (q) {
    // ANDed with the access filter above (Prisma combines top-level keys with AND).
    where.AND = [
      {
        OR: [
          { user: { email: { contains: q, mode: "insensitive" } } },
          { user: { firstName: { contains: q, mode: "insensitive" } } },
          { user: { lastName: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }
  return where;
}

/**
 * Translate a whitelisted sort column into a Prisma `orderBy` on the
 * OrgMember query. Name/email live on the related auth.User; status +
 * createdAt live on OrgMember itself. Anything unknown falls back to the
 * legacy created-ascending order.
 */
function buildUsersCentralOrderBy(
  sortBy?: string,
  sortOrder: "asc" | "desc" = "asc",
): Array<Record<string, unknown>> {
  const dir = sortOrder === "desc" ? "desc" : "asc";
  switch (sortBy) {
    case "email":
      return [{ user: { email: dir } }];
    case "fullName":
      return [{ user: { firstName: dir } }, { user: { lastName: dir } }];
    case "status":
      return [{ status: dir }];
    case "createdAt":
      return [{ createdAt: dir }];
    default:
      return [{ createdAt: "asc" }];
  }
}

/**
 * List members of an org, composed entirely from central + v2 tables.
 * Supports server-side search, status filter, sort, and pagination
 * (take/skip) — pushed down to Postgres. Pair with
 * {@link countUsersCentral} for the total.
 */
export async function listUsersCentral(
  orgId: string,
  opts: ListUsersCentralOptions = {},
): Promise<CentralUserRecord[]> {
  const where = await buildUsersCentralWhere(orgId, opts);
  if (!where) return [];
  const memberships = await db.orgMember.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastSignInAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
    orderBy: buildUsersCentralOrderBy(opts.sortBy, opts.sortOrder),
    ...(typeof opts.take === "number" ? { take: opts.take } : {}),
    ...(typeof opts.skip === "number" ? { skip: opts.skip } : {}),
  }) as Array<{
    status: string;
    role: string;
    invitationToken: string | null;
    invitedAt: Date | null;
    acceptedAt: Date | null;
    createdBy: string | null;
    user: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      lastSignInAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    };
  }>;

  if (memberships.length === 0) return [];
  const userIds = memberships.map((m) => m.user.id);

  // Parallel batched fetches for profile + role.
  const [profiles, userAppRoles] = await Promise.all([
    db.cnUserProfile.findMany({
      where: { orgId, userId: { in: userIds } },
      select: {
        userId: true,
        firstName: true,
        lastName: true,
        department: true,
        mobile: true,
        mobileAccessEnabled: true,
      },
    }) as Promise<Array<{
      userId: string;
      firstName: string;
      lastName: string;
      department: string | null;
      mobile: string | null;
      mobileAccessEnabled: boolean;
    }>>,
    db.cnUserAppRole.findMany({
      where: { orgId, userId: { in: userIds } },
      select: {
        userId: true,
        role: { select: { name: true } },
      },
    }) as Promise<Array<{
      userId: string;
      role: { name: string } | null;
    }>>,
  ]);

  const profileByUser = new Map(profiles.map((p) => [p.userId, p]));
  const roleByUser = new Map(
    userAppRoles.map((r) => [r.userId, r.role?.name ?? null]),
  );

  return memberships.map((m) =>
    buildRecord(
      {
        id: m.user.id,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        lastSignInAt: m.user.lastSignInAt,
        createdAt: m.user.createdAt,
        updatedAt: m.user.updatedAt,
        orgMember: {
          status: m.status,
          role: m.role,
          invitationToken: m.invitationToken,
          invitedAt: m.invitedAt,
          acceptedAt: m.acceptedAt,
          createdBy: m.createdBy,
        },
        profile: profileByUser.get(m.user.id) ?? null,
        roleName: roleByUser.get(m.user.id) ?? null,
      },
      orgId,
    ),
  );
}

/**
 * Total members matching the same filters as {@link listUsersCentral} —
 * for the paginated list envelope. Fails closed (0) when the App registry
 * row is missing.
 */
export async function countUsersCentral(
  orgId: string,
  opts: Pick<ListUsersCentralOptions, "search" | "status"> = {},
): Promise<number> {
  const where = await buildUsersCentralWhere(orgId, opts);
  if (!where) return 0;
  return db.orgMember.count({ where });
}

/**
 * Look up one user by central auth.User.id. Returns null if the user
 * isn't a member of the supplied org.
 */
export async function findUserByIdCentral(
  orgId: string,
  authUserId: string,
): Promise<CentralUserRecord | null> {
  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: authUserId } },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastSignInAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  }) as
    | {
        status: string;
        role: string;
        invitationToken: string | null;
        invitedAt: Date | null;
        acceptedAt: Date | null;
        createdBy: string | null;
        user: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          lastSignInAt: Date | null;
          createdAt: Date;
          updatedAt: Date;
        };
      }
    | null;
  if (!membership) return null;

  const [profile, userAppRole] = await Promise.all([
    db.cnUserProfile.findUnique({
      where: { orgId_userId: { orgId, userId: authUserId } },
      select: {
        firstName: true,
        lastName: true,
        department: true,
        mobile: true,
        mobileAccessEnabled: true,
      },
    }) as Promise<{
      firstName: string;
      lastName: string;
      department: string | null;
      mobile: string | null;
      mobileAccessEnabled: boolean;
    } | null>,
    db.cnUserAppRole.findFirst({
      where: { orgId, userId: authUserId },
      select: { role: { select: { name: true } } },
    }) as Promise<{ role: { name: string } | null } | null>,
  ]);

  return buildRecord(
    {
      id: membership.user.id,
      email: membership.user.email,
      firstName: membership.user.firstName,
      lastName: membership.user.lastName,
      lastSignInAt: membership.user.lastSignInAt,
      createdAt: membership.user.createdAt,
      updatedAt: membership.user.updatedAt,
      orgMember: {
        status: membership.status,
        role: membership.role,
        invitationToken: membership.invitationToken,
        invitedAt: membership.invitedAt,
        acceptedAt: membership.acceptedAt,
        createdBy: membership.createdBy,
      },
      profile,
      roleName: userAppRole?.role?.name ?? null,
    },
    orgId,
  );
}

/**
 * Soft-delete: flip OrgMember.status → "inactive". Replaces the legacy
 * cn_users.status write.
 */
export async function softDeleteUserCentral(
  orgId: string,
  authUserId: string,
): Promise<boolean> {
  try {
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId: authUserId } },
      data: { status: "inactive" },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Patch-style update — writes to the central tables. Used by the PATCH
 * endpoint. modulesAssigned / projectsAssigned / permissionMatrix are
 * reconciled separately by the API layer.
 */
export interface UpdateUserCentralPatch {
  firstName?: string;
  lastName?: string;
  // Already normalised (trimmed + lower-cased) and uniqueness-checked by
  // the caller. Email is the join key for the v2 reconciliation, so the
  // route validates it before this runs.
  email?: string;
  mobile?: string | null;
  department?: string | null;
  mobileAccessEnabled?: boolean;
  status?: string;
  updatedBy?: string | null;
  // Role change — caller sets v2 role separately via CnUserAppRole
  // (admin Users page does this through a dedicated endpoint).
}

export async function updateUserCentral(
  orgId: string,
  authUserId: string,
  patch: UpdateUserCentralPatch,
): Promise<CentralUserRecord | null> {
  const existing = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId: authUserId } },
    select: { id: true },
  });
  if (!existing) return null;

  // Update User_profiles for QuikInfra-specific fields. Upsert so a row
  // is created if the user predates the User_profiles table (rare).
  if (
    patch.firstName !== undefined ||
    patch.lastName !== undefined ||
    patch.mobile !== undefined ||
    patch.department !== undefined ||
    patch.mobileAccessEnabled !== undefined
  ) {
    await db.cnUserProfile.upsert({
      where: { orgId_userId: { orgId, userId: authUserId } },
      update: {
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.mobile !== undefined ? { mobile: patch.mobile } : {}),
        ...(patch.department !== undefined ? { department: patch.department } : {}),
        ...(patch.mobileAccessEnabled !== undefined
          ? { mobileAccessEnabled: patch.mobileAccessEnabled }
          : {}),
      },
      create: {
        userId: authUserId,
        orgId,
        firstName: patch.firstName ?? "",
        lastName: patch.lastName ?? "",
        department: patch.department ?? null,
        mobile: patch.mobile ?? null,
        mobileAccessEnabled: patch.mobileAccessEnabled === true,
      },
    });
  }

  // Update auth.User if firstName/lastName/email are touched. `username`
  // is derived from the email local-part on read, so updating email here
  // is enough — no separate username column to keep in sync.
  if (
    patch.firstName !== undefined ||
    patch.lastName !== undefined ||
    patch.email !== undefined
  ) {
    await db.user.update({
      where: { id: authUserId },
      data: {
        ...(patch.firstName !== undefined ? { firstName: patch.firstName } : {}),
        ...(patch.lastName !== undefined ? { lastName: patch.lastName } : {}),
        ...(patch.email !== undefined ? { email: patch.email } : {}),
      },
    });
  }

  // Update OrgMember.status for the soft-delete / activate flow.
  if (patch.status !== undefined) {
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId: authUserId } },
      data: { status: patch.status },
    });
  }

  return findUserByIdCentral(orgId, authUserId);
}
