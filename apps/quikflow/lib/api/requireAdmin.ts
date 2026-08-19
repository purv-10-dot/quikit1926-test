import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getQuikFlowAppId } from "@/lib/api/permissions";

/**
 * QuikFlow runs two parallel admin systems: the legacy `OrgMember.role`
 * string (the only thing the shared factory knows about) and dynamic-RBAC
 * v2 (`UserAppRole` → `AppRole`), which is what the Roles & Permissions tab
 * actually writes. A user promoted to admin via the v2 UI keeps
 * `OrgMember.role = "member"`, so the legacy tier check would 403 them on
 * every `requireAdmin`-gated route.
 *
 * The injected `extraAdminCheck` bridges the gap: when the legacy tier is
 * below admin, recognise an active v2 system-admin grant for THIS org's
 * QuikFlow app. Mirrors apps/quikscale/lib/api/requireAdmin.ts.
 */
export const requireAdmin = createRequireAdmin(authOptions, {
  async extraAdminCheck({ userId, orgId }) {
    const appId = await getQuikFlowAppId();
    if (!appId) return false;
    const v2Admin = await db.wfUserAppRole.findFirst({
      where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
      select: { id: true },
    });
    return !!v2Admin;
  },
});
