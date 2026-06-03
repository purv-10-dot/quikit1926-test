import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Resolves the active org for a userId. Uses the shared factory so the
 * same semantics (session.orgId → UserAppAccess fallback → Membership
 * fallback) apply across all apps. appSlug scopes the app-access lookup.
 *
 * Used by withOrgAuth wrapper. Mirrors apps/quikscale/lib/api/getOrgId.ts.
 */
export const getOrgId = createGetOrgId(authOptions, { appSlug: "quikinfra" });




