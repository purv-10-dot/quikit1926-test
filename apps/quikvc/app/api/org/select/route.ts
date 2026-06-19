/**
 * POST /api/org/select — switch active org for the current user.
 *
 * Wraps the shared @quikit/auth factory. Requires UserAppAccess for
 * "quikvc" in the chosen tenant — protects against the case where a user
 * with QuikScale-only access manipulates the request to land on QuikVC.
 */
import { authOptions } from "@/lib/auth";
import { createOrgSelectHandler } from "@quikit/auth/org-select";

export const POST = createOrgSelectHandler(authOptions, {
  appSlug: "quikvc",
});
