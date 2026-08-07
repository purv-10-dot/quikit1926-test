/**
 * Owner-based lead visibility — Stage 1.
 *
 * A role can be marked "restrict to owned leads" (per-tenant, via
 * role-config.ts). Users with such a role see ONLY leads where
 * `ownerId === their user id`, across every user-facing lead read, and cannot
 * open/edit/act on a non-owned lead by URL.
 *
 * VERIFIED FOUNDATION: QcfLead.ownerId === auth.User.id === quikit.OrgMember.userId
 * === SessionUser.userId (confirmed against real data — 0 unmatched). So the
 * comparison `ownerId === user.userId` is correct.
 *
 * Contracts intentionally mirror `account-acl.ts`:
 *   - ownerScopeFilter → Prisma `where` fragment or null (null = unrestricted),
 *     AND-merged alongside the account ACL and any advanced-filter `where`.
 *   - assertLeadOwnership → throws 403 for by-id routes, like assertAccountAccess.
 *
 * SCOPE BOUNDARY (critical): these helpers take a SessionUser and are for
 * USER-FACING reads/actions only. System/engine paths (automation worker,
 * notification/rules engine, LeadSquared sync, background jobs) operate
 * tenant-wide without a session and MUST NOT call these — doing so would
 * silently stop automations from seeing leads. Engine code reads leads directly
 * and never imports this module.
 */
import { getRoleOverride } from "@/lib/services/workspace/role-config";
import { isAdminRole } from "@/lib/auth/role-grants";
import type { SessionUser } from "@/types/permission";

/**
 * True when this user's role is configured to see only owned leads.
 * Administrator is never restricted (always sees all). Any non-admin role whose
 * tenant override has `restrictToOwnedLeads: true` is restricted. Default false
 * (no override / flag unset) → unrestricted, so nothing changes until an admin
 * turns it on.
 */
export async function isOwnerRestricted(user: SessionUser): Promise<boolean> {
  if (isAdminRole(user.role)) return false;
  const override = await getRoleOverride(user.tenantId, user.role);
  return override?.restrictToOwnedLeads === true;
}

/**
 * Prisma `where` fragment restricting leads to those owned by the user, or null
 * when the user is unrestricted (caller AND-merges, skipping when null — exactly
 * like accountScopeFilter). AND-composing `{ ownerId }` with an advanced-filter
 * `where` yields "matches the filter AND owned by me", which is both correct and
 * impossible to bypass (a filter targeting another owner intersects to empty).
 */
export async function ownerScopeFilter(
  user: SessionUser,
): Promise<{ ownerId: string } | null> {
  if (await isOwnerRestricted(user)) {
    return { ownerId: user.userId };
  }
  return null;
}

/**
 * Guard for by-id lead routes: after loading the lead, ensure a restricted user
 * owns it. Throws a 403 (matching assertAccountAccess's error shape) when a
 * restricted user targets a lead they don't own. No-op for unrestricted users.
 *
 * Pass the lead's ownerId (already loaded by the route). Kept as a plain value
 * (not the whole lead) so it works uniformly across routes that select
 * different lead shapes.
 */
export async function assertLeadOwnership(
  user: SessionUser,
  leadOwnerId: string | null | undefined,
): Promise<void> {
  if (!(await isOwnerRestricted(user))) return;
  if (leadOwnerId !== user.userId) {
    const err = new Error("Forbidden: lead not owned by user") as Error & {
      statusCode?: number;
    };
    err.statusCode = 403;
    throw err;
  }
}
