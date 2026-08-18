/**
 * Self-heal for a missing `app_quiklms.UserAppRole` row.
 *
 * WHY THIS EXISTS. Both role resolvers — `resolveLmsRole` (page guards) and
 * `getAuthContext` (API guards) — end in the same fallback: when the user has
 * neither a `UserAppRole` assignment nor an `LmsUser` row, the role is derived
 * from the central `OrgMember.role`. That fallback is deliberate and must stay
 * (the platform operator has no LMS row by nature), but on its own it is a
 * permanent crutch: the assignment row is never written, so every request for
 * that user re-derives the role and the RBAC tables stay empty.
 *
 * The row goes missing because of an ordering gap upstream:
 * `apps/quikit/app/api/org/apps/activate/route.ts` collects `adminUserIds` with
 * `status: "active"`, so a still-`invited` admin is not in the payload sent to
 * `POST /api/internal/provision-roles`. The role CATALOGUE gets seeded, nobody
 * gets assigned, and nothing re-runs after the invite is accepted.
 *
 * This turns the fallback into a one-time repair instead: the first request
 * that falls through writes the assignment, and every later request is answered
 * by `getAssignedLmsRole` — the same single source of truth quikscale uses.
 * Existing users heal as they sign in, so no migration script is needed.
 *
 * DELIBERATELY CONSERVATIVE:
 *
 *   - It persists the role that was ALREADY resolved. It never changes a
 *     decision, so a heal cannot promote or demote anyone.
 *   - Only runs when the FULL fallback fired (no assignment AND no LMS row).
 *     A user whose `LmsUser.role` answered is left alone — writing the central
 *     role over a roster-assigned one would silently change their role.
 *   - Skips the platform operator: grants are keyed `(userId, orgId)` and a
 *     cross-tenant operator has no org for one to live in.
 *   - Fire-and-forget and never throws. This sits on the request path of 292
 *     handlers plus every page guard; a slow or failing write must not turn a
 *     working request into a failed one.
 */
import type { LmsUserRole } from '@prisma/client';
import { ensureUserOnLmsRole } from '@/lib/api/seed-lms-app-roles';

/**
 * Per-process record of (user, org) pairs already healed, so a user browsing
 * ten pages triggers one write rather than ten. `ensureUserOnLmsRole` is
 * idempotent, so this is a cost guard, not a correctness one — which is why a
 * failure re-arms the key instead of leaving it burnt.
 */
const attempted = new Set<string>();

export function healLmsRoleAssignment(
  userId: string | null | undefined,
  orgId: string | null | undefined,
  role: LmsUserRole,
  isSuperAdmin?: boolean,
): void {
  if (isSuperAdmin === true) return;
  if (!userId || !orgId) return;

  const key = `${userId}:${orgId}`;
  if (attempted.has(key)) return;
  attempted.add(key);

  void ensureUserOnLmsRole(userId, orgId, role)
    .then((assigned) => {
      if (!assigned) attempted.delete(key);
    })
    .catch(() => {
      // Re-arm so a transient failure gets another chance on the next request.
      attempted.delete(key);
    });
}
