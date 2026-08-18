import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import { authOptions } from "@/lib/auth";

/**
 * Resolves the active orgId for the signed-in user (tenant isolation).
 * Every DB-touching route filters by this value — see @/lib/api/withOrgAuth.
 */
export const getOrgId = createGetOrgId(authOptions, { appSlug: "quikflow" });
