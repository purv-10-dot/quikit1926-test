import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getQuikScaleAppId } from "@/lib/api/permissions";

/**
 * QuikScale runs two parallel admin systems: the legacy `OrgMember.role`
 * string (the only thing the shared factory knows about) and dynamic-RBAC
 * v2 (`UserAppRole` → `AppRole`), which is what Org Setup → User Management
 * actually writes. A user promoted to admin via the v2 UI keeps
 * `OrgMember.role = "member"`, so the legacy tier check 403s them on every
 * `requireAdmin`-gated route.
 *
 * The injected `extraAdminCheck` bridges the gap: when the legacy tier is
 * below admin, recognise an active v2 system-admin grant for THIS org's
 * QuikScale app. v2 schema stays in the app (no layering violation); the
 * session / membership resolver stays single-sourced in @quikit/auth.
 */
export const requireAdmin = createRequireAdmin(authOptions, {
  async extraAdminCheck({ userId, orgId }) {
    const appId = await getQuikScaleAppId();
    if (!appId) return false;
    const v2Admin = await db.userAppRole.findFirst({
      where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
      select: { id: true },
    });
    return !!v2Admin;
  },
});
