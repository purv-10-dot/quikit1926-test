/**
 * POST /api/org/select — switch active org for the current user.
 *
 * Wraps the shared factory from @quikit/auth. QuikScale scoping requires
 * UserAppAccess for "quikscale" in the chosen tenant.
 */
import { authOptions } from "@/lib/auth";
import { createOrgSelectHandler } from "@quikit/auth/org-select";

export const POST = createOrgSelectHandler(authOptions, {
  appSlug: "quikscale",
});
