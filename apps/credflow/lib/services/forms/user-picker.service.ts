/**
 * FR-RE Unit 3a (FR-RE-3) — user_picker field type.
 *
 * Two responsibilities:
 *   1. listUsersForPicker — the RBAC-scoped list of users an agent may pick.
 *   2. validateUserPickerSelection — single/multi + dedup guard for the value
 *      written to CrmFieldValue.valueUserIds on save (full save wiring: Unit 6).
 *
 * RBAC model — the user-level analog of getScope (lib/auth/account-acl.ts),
 * reusing the SAME group tables (CrmSalesGroupMember + CrmSalesGroupManager):
 *   - Administrator  -> unrestricted (sees every active tenant user).
 *   - Any other user -> may only see their sales-group co-members (+ themselves).
 *
 * Deliberate divergence from getScope: there, an empty ACL means "unrestricted"
 * (back-compat for ACCOUNT access). Here that would leak identities across
 * scopes (AC-RE-17), so a non-admin in NO sales group is FAIL-CLOSED to
 * themselves only — missing scope data must mean "see less", not "see all".
 */
import { db } from "@/lib/db";
import type { Prisma } from "@quikit/database";

const ADMIN_ROLE = "Administrator";

export type UserPickerScope = "all_users" | "team" | "role";
export type UserPickerMode = "single" | "multi";

export interface UserPickerOption {
  id: string;
  name: string;
  email: string;
}

export class UserPickerValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "UserPickerValidationError";
    this.statusCode = statusCode;
  }
}

interface SessionLike {
  userId: string;
  tenantId: string;
  role: string;
}

/** The sales groups the caller belongs to (member OR manager). */
async function callerGroupIds(userId: string): Promise<string[]> {
  const [member, manager] = await Promise.all([
    db.crmSalesGroupMember.findMany({ where: { userId }, select: { groupId: true } }),
    db.crmSalesGroupManager.findMany({ where: { userId }, select: { groupId: true } }),
  ]);
  return [
    ...new Set([...member.map((g) => g.groupId), ...manager.map((g) => g.groupId)]),
  ];
}

/** Every user (member OR manager) who belongs to any of the given groups. */
async function usersInGroups(groupIds: string[]): Promise<Set<string>> {
  if (groupIds.length === 0) return new Set();
  const [members, managers] = await Promise.all([
    db.crmSalesGroupMember.findMany({
      where: { groupId: { in: groupIds } },
      select: { userId: true },
    }),
    db.crmSalesGroupManager.findMany({
      where: { groupId: { in: groupIds } },
      select: { userId: true },
    }),
  ]);
  return new Set([
    ...members.map((m) => m.userId),
    ...managers.map((m) => m.userId),
  ]);
}

/** Caller's own team co-members, always including the caller themselves. */
async function callerTeam(userId: string): Promise<Set<string>> {
  const team = await usersInGroups(await callerGroupIds(userId));
  team.add(userId);
  return team;
}

/**
 * The RBAC-scoped user list for a user_picker field. The result is ALWAYS
 * clamped to what the calling user is permitted to see — an Administrator sees
 * everyone; anyone else sees only their team (fail-closed to self if teamless).
 */
export async function listUsersForPicker(
  user: SessionLike,
  opts: { scope: UserPickerScope; role?: string | null },
): Promise<UserPickerOption[]> {
  const isAdmin = user.role === ADMIN_ROLE;

  // Permitted set (the security clamp). null === unrestricted (admin only).
  const permitted = isAdmin ? null : await callerTeam(user.userId);

  // Population by configured scope.
  const where: Prisma.OrgMemberWhereInput = {
    orgId: user.tenantId,
    status: "active",
  };
  if (opts.scope === "role") {
    // No role => no population (cannot widen past a missing filter).
    where.role = opts.role ?? "\0__no_such_role__";
  }
  if (opts.scope === "team") {
    // "Your team" — resolved per-caller (admin included). Self-only if teamless.
    where.userId = { in: [...(await callerTeam(user.userId))] };
  }

  const members = await db.orgMember.findMany({
    where,
    select: {
      userId: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const visible = permitted
    ? members.filter((m) => permitted.has(m.userId))
    : members;

  return visible
    .filter((m): m is typeof m & { user: NonNullable<typeof m.user> } => m.user != null)
    .map((m) => ({
      id: m.user.id,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      email: m.user.email,
    }));
}

/**
 * Validate a user_picker selection before it is written to
 * CrmFieldValue.valueUserIds. Required-ness is enforced separately by the
 * field's requiredLevel, so an empty selection is allowed here.
 */
export function validateUserPickerSelection(
  mode: UserPickerMode,
  userIds: string[],
): void {
  if (new Set(userIds).size !== userIds.length) {
    throw new UserPickerValidationError("A user cannot be selected more than once.");
  }
  if (mode === "single" && userIds.length > 1) {
    throw new UserPickerValidationError("This field accepts only a single user.");
  }
}
