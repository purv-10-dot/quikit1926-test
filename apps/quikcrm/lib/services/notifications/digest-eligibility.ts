/**
 * Digest recipient ELIGIBILITY (Phase 5 recipient feature, Stage 1).
 *
 * Decides WHO can be a digest recipient. Single source of truth, used by:
 *   - the read API  (Settings → Users: render the toggle enabled/disabled + reason)
 *   - the write API  (reject toggling an ineligible user)
 *   - digest-run     (defense-in-depth: drop a since-ineligible recipient at send)
 *
 * Rules (spec 2026-06-25):
 *   - Administrator                                   → eligible (org-wide scope)
 *   - SalesManager who OWNS ≥1 group in THIS org      → eligible (team scope)
 *   - SalesManager with no group in this org          → ineligible "no-team"
 *   - SalesUser / Marketing / Finance / anything else → ineligible "not-eligible-role"
 *
 * INVARIANT (eligibility ⟺ has-a-resolvable-team): the SalesManager group lookup
 * here mirrors resolveManagerTeam (lib/services/dashboard/team.ts) EXACTLY — same
 * query (crmSalesGroupManager.findMany where userId, select group.orgId) and the
 * SAME org-via-join filter (group.orgId === user.orgId). If they diverged, a
 * SalesManager could be marked eligible yet resolve an empty team at send time
 * (recipient with an empty digest). Keep these two in lockstep.
 *
 * No CrmUserAppRole dependency (that was the silent-skip root cause).
 */

import { prisma } from "@/lib/db/prisma";

export type DigestIneligibleReason = "no-team" | "not-eligible-role";

export interface DigestEligibility {
  eligible: boolean;
  reason?: DigestIneligibleReason;
}

/** Caller identity needed to decide eligibility. */
interface EligibilityUser {
  userId: string;
  orgId: string;
  role: string;
}

export async function isDigestEligible(user: EligibilityUser): Promise<DigestEligibility> {
  // Admin → eligible, org-wide. No group query needed.
  if (user.role === "Administrator") {
    return { eligible: true };
  }

  // SalesManager → eligible iff they own ≥1 group IN THIS ORG.
  if (user.role === "SalesManager") {
    // Mirrors resolveManagerTeam (team.ts:30-40) exactly so eligibility ⟺ a
    // resolvable team. The manager link table has no orgId column, so we trust
    // the join and filter on group.orgId === user.orgId.
    const managed = await prisma.crmSalesGroupManager.findMany({
      where: { userId: user.userId },
      select: { groupId: true, group: { select: { orgId: true } } },
    });
    const ownsGroupInOrg = managed.some((g) => g.group.orgId === user.orgId);
    return ownsGroupInOrg ? { eligible: true } : { eligible: false, reason: "no-team" };
  }

  // SalesUser / Marketing / Finance / unknown → not eligible by role.
  return { eligible: false, reason: "not-eligible-role" };
}
