import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Resolves the caller's active org id from their session, re-validating
 * active membership AND quikasset app-access (60s cached). Returns null when
 * the user has no active membership / no access to this app.
 */
export const getOrgId = createGetOrgId(authOptions, { appSlug: "quikasset" });
