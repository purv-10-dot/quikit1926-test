/**
 * Shared RBAC helpers for step-based approval workflows.
 *
 * Previously each submit/approve route had its own copy of
 * `userTypeFromRoleKey` + `isSelfStep` + `canActOnStep`. They disagreed
 * on one subtle point — skip logic ignored the role hierarchy, so a
 * Site Admin submitting a PR whose Step 1 is pinned to a regular User
 * still landed on that lower-rank step for approval. This module
 * centralises the rules so every entity (PR / Indent / PO / GRN / RFQ)
 * behaves the same way.
 */

import { USER_TYPE_CATALOG, getUserTypeRank } from "@/lib/rbac/user-types";

export interface WorkflowStepLike {
  approverUserId: string | null;
  approverRoleId: string | null;
}

export interface Raiser {
  userId: string;
  userType: string | undefined;
}

export interface Actor {
  userId: string;
  roleKey: string;
  projectIds?: string[];
}

/** Reverse-lookup: the user's backing roleKey → their user type key. */
export function userTypeFromRoleKey(
  roleKey: string | null | undefined,
): string | undefined {
  if (!roleKey) return undefined;
  return USER_TYPE_CATALOG.find((t) => t.backingRole === roleKey)?.key;
}

/**
 * True when the raiser should auto-skip this step at submit time.
 *
 * A step is skippable if:
 *   - the step is pinned to the raiser themselves, OR
 *   - the step's required role is at or below the raiser's rank
 *     (SITE_ADMIN outranks USER, ADMIN outranks everyone, etc.).
 *
 * Rank skip applies even when a specific user is pinned: the pinned
 * user is part of that role's pool, so the raiser outranks them too.
 * Skipped steps are recorded in history as auto-approved so the
 * timeline still reads as a complete chain of authority.
 */
export function isSkippableByRaiser(
  step: WorkflowStepLike,
  raiser: Raiser,
): boolean {
  if (step.approverUserId && step.approverUserId === raiser.userId) {
    return true;
  }
  if (step.approverRoleId && raiser.userType) {
    return (
      getUserTypeRank(raiser.userType) >= getUserTypeRank(step.approverRoleId)
    );
  }
  return false;
}

/**
 * True when the caller is allowed to act on the given step.
 *
 *   - ADMIN / SUPER_ADMIN bypass every step (so they can unblock flows).
 *   - Pinned-user steps require an exact user-id match.
 *   - Role-only steps accept any caller whose rank is >= the step's role,
 *     subject to the caller's project scope when their role is site-bound.
 *
 * Pinned-user checks remain strict so a configured delegation can't be
 * silently overridden — if the pinned person is absent, the ADMIN
 * bypass is the escape hatch.
 */
export function canActOnStep(
  actor: Actor,
  step: WorkflowStepLike,
  entityProjectId: string | null,
): boolean {
  const callerType = userTypeFromRoleKey(actor.roleKey);
  if (callerType === "SUPER_ADMIN" || callerType === "ADMIN") return true;

  if (step.approverUserId) return step.approverUserId === actor.userId;
  if (!callerType || !step.approverRoleId) return false;
  if (getUserTypeRank(callerType) < getUserTypeRank(step.approverRoleId)) {
    return false;
  }

  if (actor.projectIds === undefined) return true;
  if (!entityProjectId) return false;
  return actor.projectIds.includes(entityProjectId);
}

/**
 * Inbox variant of canActOnStep — no project scope check, because the
 * inbox listing doesn't know the entity's project at row-select time.
 * The per-entity approve route still enforces project scope.
 */
export function canActOnStepForInbox(
  actor: { userId: string; roleKey: string },
  step: WorkflowStepLike,
): boolean {
  const callerType = userTypeFromRoleKey(actor.roleKey);
  if (callerType === "SUPER_ADMIN" || callerType === "ADMIN") return true;
  if (step.approverUserId) return step.approverUserId === actor.userId;
  if (!callerType || !step.approverRoleId) return false;
  return getUserTypeRank(callerType) >= getUserTypeRank(step.approverRoleId);
}
