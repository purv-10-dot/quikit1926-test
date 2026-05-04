import { createGetTenantId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Resolves the active tenant for a userId. Uses the shared factory so the
 * same semantics (session.orgId → UserAppAccess fallback → Membership
 * fallback) apply across all apps. appSlug scopes the app-access lookup.
 */
export const getTenantId = createGetTenantId(authOptions, { appSlug: "quikconstruction" });
