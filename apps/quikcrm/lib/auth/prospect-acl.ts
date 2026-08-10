/**
 * Prospect ACL — who can see which CrmProspect rows.
 *
 * Role → scope mapping
 * ────────────────────
 * Administrator  : unrestricted (every prospect in the org). `mapRole` collapses
 *                  every admin-shaped platform role (admin / owner / org_admin /
 *                  app_admin / super_admin / administrator) into "Administrator",
 *                  so this single check covers both "Organization Admin" and
 *                  "Administrator".
 * Everyone else  : own prospects only — rows they personally saved
 *                  (CrmProspect.savedById === their user id).
 *
 * This is deliberately simpler than lib/auth/account-acl.ts: a prospect is a raw
 * LinkedIn capture that has not entered the pipeline yet, so it has no account,
 * no sales group, and no team linkage to widen visibility through. There is no
 * manager roll-up by design — a SalesManager sees only what they saved, same as
 * a SalesUser. Once a prospect is converted the resulting CrmLead is governed by
 * the normal account ACL, so team visibility resumes there.
 *
 * Legacy rows saved before CrmProspect.savedById was populated have
 * savedById = null. They are visible to Administrators only — a null owner
 * cannot match any user id, and we never widen a null to "everyone" (that would
 * be the exact data leak this ACL exists to close).
 */
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/types/permission";

const ADMIN_ROLES = new Set(["Administrator"]);

/** True when the user may see every prospect in their org. */
export function canViewAllProspects(user: Pick<SessionUser, "role">): boolean {
  return ADMIN_ROLES.has(user.role);
}

/**
 * The `where` clause for reading prospects as this user. Always org-scoped;
 * narrowed to `savedById = <user>` for non-admins.
 *
 * Use this for EVERY CrmProspect read (list, detail, convert) so visibility and
 * mutation authorization can never drift apart.
 */
export function prospectScopeWhere(
  user: Pick<SessionUser, "role" | "userId" | "orgId">,
): Prisma.CrmProspectWhereInput {
  if (canViewAllProspects(user)) return { orgId: user.orgId };
  return { orgId: user.orgId, savedById: user.userId };
}
