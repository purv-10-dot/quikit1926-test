import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Canonical org-id resolver for QuikSupport — mirrors quiktrack/quikscale.
 *
 * Reads the active orgId from the session JWT, re-validates the user's active
 * membership, and gates on per-app `UserAppAccess` for slug "quiksupport"
 * (60s cache). Used by `withOrgAuth`; do not read `session.user.orgId`
 * directly in route handlers.
 */
export const getOrgId = createGetOrgId(authOptions, { appSlug: "quiksupport" });
