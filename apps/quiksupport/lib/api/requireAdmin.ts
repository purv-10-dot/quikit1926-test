import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { isQuikSupportAppAdmin } from "@/lib/api/permissions";

/**
 * Admin guard for QuikSupport's standard-RBAC (Qsp*) management routes.
 *
 * Passes when the caller is EITHER an org-tier admin (the only thing the shared
 * factory checks — `OrgMember.role` ∈ ADMIN_TIER_ROLES) OR a QuikSupport
 * app-admin (holds the `QspAppRole` "admin" for this org). The injected
 * `extraAdminCheck` adds the app-admin path without relaxing the 401 / no-org /
 * no-membership guards. Mirrors quiktrack/quikscale `lib/api/requireAdmin.ts`.
 *
 * NOTE: this gates the standard per-app RBAC surface (/api/org/*). The
 * helpdesk's own domain routes keep using `requireRole(user, "HELPDESK_ADMIN")`
 * against `HdUser.role`.
 */
export const requireAdmin = createRequireAdmin(authOptions, {
  extraAdminCheck: ({ userId, orgId }) => isQuikSupportAppAdmin(userId, orgId),
});
