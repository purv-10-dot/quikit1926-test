/**
 * GET /api/org/memberships — list orgs the current user belongs to.
 *
 * Wraps the shared factory from @quikit/auth. QuikScale-specific scoping:
 *   - filter to tenants where the user has UserAppAccess for "quikscale"
 *
 * Logic body lives in packages/auth/org-memberships.ts; same handler
 * shape is used by quikvc and any future SSO-client app.
 */
import { authOptions } from "@/lib/auth";
import { createOrgMembershipsHandler } from "@quikit/auth/org-memberships";

export const GET = createOrgMembershipsHandler(authOptions, {
  appSlug: "quikscale",
});
