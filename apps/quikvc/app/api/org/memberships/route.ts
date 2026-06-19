/**
 * GET /api/org/memberships — list orgs the current user belongs to.
 *
 * Wraps the shared @quikit/auth factory. Filters to tenants where the user
 * has UserAppAccess for "quikvc" so the picker doesn't surface QuikScale-
 * only tenants.
 */
import { authOptions } from "@/lib/auth";
import { createOrgMembershipsHandler } from "@quikit/auth/org-memberships";

export const GET = createOrgMembershipsHandler(authOptions, {
  appSlug: "quikvc",
});
