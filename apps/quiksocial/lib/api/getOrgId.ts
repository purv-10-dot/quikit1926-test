import { createGetTenantId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Resolves the active orgId for a signed-in user. The shared factory in
 * `@quikit/auth` is named `createGetTenantId` for legacy reasons (back when
 * QuikIT used `tenantId`); the value it returns is the `orgId` column used
 * across every app.
 */
export const getOrgId = createGetTenantId(authOptions, {});
