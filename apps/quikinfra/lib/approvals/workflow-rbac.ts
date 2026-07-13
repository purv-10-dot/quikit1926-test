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
  /** Legacy single approver. Used as the fallback when `approverUserIds` is empty. */
  approverUserId: string | null;
  /**
   * Pool of users eligible to act on this step (any-one-can-approve).
   * When present and non-empty, this supersedes `approverUserId`. The
   * requester is removed at resolve time — see `isSkippableByRaiser`.
   */
  approverUserIds?: string[] | null;
  approverRoleId: string | null;
}

/**
 * Normalised pool view of a step's eligible approvers — internal helper so
 * callers below don't repeat the legacy-fallback logic. Returns:
 *   - the array column when set + non-empty
 *   - else a single-element array of the legacy column when set
 *   - else an empty array (step is role-only)
 */
function approverPool(step: WorkflowStepLike): string[] {
  if (Array.isArray(step.approverUserIds) && step.approverUserIds.length > 0) {
    return step.approverUserIds;
  }
  if (step.approverUserId) return [step.approverUserId];
  return [];
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
 *   - the raiser is in the step's approver pool (peers never approve
 *     each other — having the role means raising the request already
 *     satisfies the step), OR
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
  // Pool case (single pinned OR multi-user pool): skip whenever the raiser
  // is in the pool. The raiser already represents that step's role — pulling
  // in a peer to rubber-stamp the same role would add noise without adding
  // oversight. Approvals only escalate upward, so the next step (different
  // role / higher rank) is where real review happens.
  const pool = approverPool(step);
  if (pool.length > 0) {
    if (pool.includes(raiser.userId)) return true;
    return false;
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
 *   - SUPER_ADMIN is the only break-glass role — it bypasses every step
 *     so the MoreYeahs platform team can always unstick a tenant.
 *   - Pinned-user steps require an exact user-id match.
 *   - Role-only steps accept any caller whose rank is >= the step's role,
 *     subject to the caller's project scope when their role is site-bound.
 *
 * Tenant ADMINs do NOT get a universal bypass: they can SEE every pending
 * request in the inbox (because their permission set has `*`), but they
 * can only ACT on a step when explicitly configured into it. This keeps
 * the audit trail honest and prevents an admin from silently overriding
 * a deliberately-pinned approver.
 */
export function canActOnStep(
  actor: Actor,
  step: WorkflowStepLike,
  entityProjectId: string | null,
): boolean {
  const callerType = userTypeFromRoleKey(actor.roleKey);
  if (callerType === "SUPER_ADMIN") return true;

  const pool = approverPool(step);
  if (pool.length > 0) return pool.includes(actor.userId);

  if (!callerType || !step.approverRoleId) return false;
  if (getUserTypeRank(callerType) < getUserTypeRank(step.approverRoleId)) {
    return false;
  }

  if (actor.projectIds === undefined) return true;
  if (!entityProjectId) return false;
  return actor.projectIds.includes(entityProjectId);
}

/**
 * Pure predicate — given an already-loaded approval instance (with its
 * workflow.steps array), returns true when the actor can act on the
 * instance's current step. Returns false when the instance isn't
 * pending, the current step is missing, or `canActOnStep` rejects.
 *
 * Used by GET routes to populate `approval.canActOnCurrentStep` on
 * detail responses so the UI can hide Approve/Reject for the wrong
 * user without duplicating role logic on the client.
 */
export function canActOnCurrentStep(
  actor: Actor,
  instance: {
    status: string;
    currentStepOrder: number;
    workflow: {
      steps: Array<
        WorkflowStepLike & { stepOrder: number }
      >;
    };
  },
  entityProjectId: string | null,
): boolean {
  if (instance.status !== "pending_approval") return false;
  const step = instance.workflow.steps.find(
    (s) => s.stepOrder === instance.currentStepOrder,
  );
  if (!step) return false;
  return canActOnStep(actor, step, entityProjectId);
}

/**
 * Inbox variant of canActOnStep — no project scope check, because the
 * inbox listing doesn't know the entity's project at row-select time.
 * The per-entity approve route still enforces project scope.
 *
 * Same bypass policy as canActOnStep: SUPER_ADMIN only.
 */
export function canActOnStepForInbox(
  actor: { userId: string; roleKey: string },
  step: WorkflowStepLike,
): boolean {
  const callerType = userTypeFromRoleKey(actor.roleKey);
  if (callerType === "SUPER_ADMIN") return true;
  const pool = approverPool(step);
  if (pool.length > 0) return pool.includes(actor.userId);
  if (!callerType || !step.approverRoleId) return false;
  return getUserTypeRank(callerType) >= getUserTypeRank(step.approverRoleId);
}
