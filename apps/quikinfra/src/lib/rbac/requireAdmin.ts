/**
 * QuikInfra — admin gate (route-level).
 *
 * Wraps the shared @quikit/auth/require-admin factory with an
 * extraAdminCheck that bridges the dual role-system:
 *
 *   1. Shared factory checks legacy OrgMember.role tier (super_admin/org_admin/admin).
 *      → If it passes, the route is allowed.
 *
 *   2. If the legacy tier is below admin, our extraAdminCheck fires. It
 *      promotes the user to admin IFF they hold an active v2 CnUserAppRole
 *      pointing at a system-admin CnAppRole for this org's QuikInfra app.
 *
 * Without this bridge, anyone promoted to admin via the v2 UI (Phase 6)
 * would 403 on every shared `requireAdmin` gate — the same trap quikscale
 * hit and patched (see apps/quikscale/lib/api/requireAdmin.ts).
 *
 * Rule for route authors: always import `requireAdmin` from this file,
 * never directly from `@quikit/auth/require-admin`.
 */

import { createRequireAdmin } from "@quikit/auth/require-admin";
import { db } from "@quikit/database";
import { authOptions } from "@/lib/auth";
import { getQuikInfraAppId } from "./userCan";

export const requireAdmin = createRequireAdmin(authOptions, {
  async extraAdminCheck({ userId, orgId }) {
    const appId = await getQuikInfraAppId();
    if (!appId) return false;
    const v2Admin = await db.cnUserAppRole.findFirst({
      where: {
        userId,
        orgId,
        role: { appId, isSystem: true, name: "admin" },
      },
      select: { id: true },
    });
    return !!v2Admin;
  },
});
