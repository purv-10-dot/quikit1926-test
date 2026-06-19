import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { isQuikTrackAppAdmin } from "@/lib/api/permissions";

/**
 * QuikTrack runs two parallel admin systems: the legacy `OrgMember.role`
 * tier (the only thing the shared factory checks) and dynamic-RBAC v2
 * (`QtUserAppRole` → `QtAppRole`), which is what Settings → User Management
 * actually assigns. A user promoted to admin via the v2 UI keeps
 * `OrgMember.role = "member"`, so the legacy tier check would 403 them on
 * every `requireAdmin`-gated route (e.g. GET /api/org/roles).
 *
 * The injected `extraAdminCheck` bridges the gap: when the legacy tier is
 * below admin, recognise an active v2 system-admin grant for THIS org's
 * QuikTrack app. Org owners/admins still pass via the legacy tier; this only
 * ADDS the app-admin path (it never relaxes the 401 / no-org / no-membership
 * guards above it). Mirrors apps/quikscale/lib/api/requireAdmin.ts.
 */
export const requireAdmin = createRequireAdmin(authOptions, {
  extraAdminCheck: ({ userId, orgId }) => isQuikTrackAppAdmin(userId, orgId),
});
