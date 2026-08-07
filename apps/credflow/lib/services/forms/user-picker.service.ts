/**
 * FR-RE Unit 3a (FR-RE-3) — user_picker field type.
 *
 * Two responsibilities:
 *   1. listUsersForPicker — the user list an agent may pick for a user_picker field.
 *   2. validateUserPickerSelection — single/multi + dedup guard for the value
 *      written to CrmFieldValue.valueUserIds on save (full save wiring: Unit 6).
 *
 * Scope model (2026-08-06):
 *   - all_users -> every ACTIVE tenant user (the field is explicitly configured
 *     as an org-wide picker, so it is NOT clamped to the caller's team; this is
 *     what "add a user_picker showing all users" requires). Read-only identity
 *     data (name + email) within the caller's own tenant — no cross-tenant leak.
 *   - team       -> the caller's sales-group co-members (+ self); self-only if teamless.
 *   - role       -> active tenant users holding the given role (no role => empty).
 *
 * The team/role clamps reuse the SAME group tables as getScope
 * (CrmSalesGroupMember + CrmSalesGroupManager). Missing scope data fails CLOSED
 * (see callerTeam) so a teamless non-admin never widens past themselves on the
 * team scope. all_users is an intentional, config-driven org-wide list.
 */
import { db } from "@/lib/db";
import type { Prisma } from "@quikit/database";

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
  return [...new Set([...member.map((g) => g.groupId), ...manager.map((g) => g.groupId)])];
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
  return new Set([...members.map((m) => m.userId), ...managers.map((m) => m.userId)]);
}

/** Caller's own team co-members, always including the caller themselves. */
async function callerTeam(userId: string): Promise<Set<string>> {
  const team = await usersInGroups(await callerGroupIds(userId));
  team.add(userId);
  return team;
}

function toOptions(
  members: { userId: string; user: { id: string; firstName: string | null; lastName: string | null; email: string } | null }[],
): UserPickerOption[] {
  return members
    .filter((m): m is typeof m & { user: NonNullable<typeof m.user> } => m.user != null)
    .map((m) => ({
      id: m.user.id,
      name: `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim(),
      email: m.user.email,
    }));
}

/**
 * The user list for a user_picker field, resolved by the field's configured
 * scope. all_users returns every active tenant user (org-wide, by design);
 * team/role are clamped to the caller's permitted set.
 */
export async function listUsersForPicker(
  user: SessionLike,
  opts: { scope: UserPickerScope; role?: string | null },
): Promise<UserPickerOption[]> {
  const where: Prisma.OrgMemberWhereInput = {
    orgId: user.tenantId,
    status: "active",
  };

  if (opts.scope === "all_users") {
    // Org-wide, config-driven picker: all active users in the caller's tenant.
    // No team clamp — the field is explicitly an all-users picker. Tenant scope
    // (orgId) still prevents any cross-tenant exposure.
    const members = await db.orgMember.findMany({
      where,
      select: {
        userId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return toOptions(members);
  }

  if (opts.scope === "role") {
    // No role => no population (cannot widen past a missing filter).
    where.role = opts.role ?? "\0__no_such_role__";
    const members = await db.orgMember.findMany({
      where,
      select: {
        userId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    return toOptions(members);
  }

  // scope === "team": the caller's sales-group co-members (+ self). Fail-closed
  // to self when teamless — missing scope data means "see less", not "see all".
  const team = await callerTeam(user.userId);
  where.userId = { in: [...team] };
  const members = await db.orgMember.findMany({
    where,
    select: {
      userId: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return toOptions(members);
}

/**
 * Validate a user_picker selection before it is written to
 * CrmFieldValue.valueUserIds. Required-ness is enforced separately by the
 * field's requiredLevel, so an empty selection is allowed here.
 */
export function validateUserPickerSelection(mode: UserPickerMode, userIds: string[]): void {
  if (new Set(userIds).size !== userIds.length) {
    throw new UserPickerValidationError("A user cannot be selected more than once.");
  }
  if (mode === "single" && userIds.length > 1) {
    throw new UserPickerValidationError("This field accepts only a single user.");
  }
}