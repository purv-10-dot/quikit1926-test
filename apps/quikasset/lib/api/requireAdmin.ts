import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getQuikAssetAppId } from "@/lib/api/permissions";

/**
 * Recognises both the legacy membership-tier admin AND a QuikAsset RBAC v2
 * system-admin grant. A user promoted to admin via the in-app role UI keeps
 * `OrgMember.role = "member"`, so the bare tier check would 403 them — the
 * `extraAdminCheck` bridges that gap.
 */
export const requireAdmin = createRequireAdmin(authOptions, {
  async extraAdminCheck({ userId, orgId }) {
    const appId = await getQuikAssetAppId();
    if (!appId) return false;
    const v2Admin = await db.astUserAppRole.findFirst({
      where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
      select: { id: true },
    });
    return !!v2Admin;
  },
});
