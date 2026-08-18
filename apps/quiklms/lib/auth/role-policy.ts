/**
 * Role-assignment policy — who may mint whom.
 *
 * The roster/registration path (`POST /api/auth/register`) lets an admin create
 * a login-capable user with a caller-supplied `role`. Without a policy check a
 * TENANT_ADMIN or SUB_ADMIN could POST `role: "ADMIN"` and mint an account
 * ABOVE their own tier — a privilege-escalation hole. This module is the single
 * source of truth for the allowed (actor → target) role assignments and is kept
 * as pure functions so it unit-tests without any DB/session.
 *
 * Invariants:
 *   - A caller may only assign roles STRICTLY BELOW their own rank (no lateral,
 *     no upward).
 *   - ADMIN is never assignable through this path. The top tier is conferred on
 *     the org's FOUNDING admin, who arrives from apps/quikit (`POST
 *     /api/super/orgs`) as an `org_admin` OrgMember — not from the LMS roster.
 */
import type { LmsUserRole as UserRole } from '@prisma/client';

/** Privilege rank — a higher number outranks a lower one. */
const ROLE_RANK: Record<UserRole, number> = {
  ADMIN: 6,
  TENANT_ADMIN: 5,
  SUB_ADMIN: 4,
  MANAGER: 3,
  TEACHER: 2,
  PARENT: 2,
  LEARNER: 1,
};

export const ALL_ROLES = Object.keys(ROLE_RANK) as UserRole[];

/** Type guard — is an arbitrary string one of the 7 UserRole enum values? */
export function isUserRole(value: string): value is UserRole {
  return Object.prototype.hasOwnProperty.call(ROLE_RANK, value);
}

/**
 * The roles `actorRole` is permitted to assign when creating a user: everything
 * strictly below their rank, minus ADMIN (never mintable via the roster).
 */
export function assignableRoles(actorRole: UserRole): UserRole[] {
  const rank = ROLE_RANK[actorRole] ?? 0;
  return ALL_ROLES.filter((r) => r !== 'ADMIN' && ROLE_RANK[r] < rank);
}

/** Whether `actorRole` may assign `targetRole` (see {@link assignableRoles}). */
export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return assignableRoles(actorRole).includes(targetRole);
}
