import { createRequireAdmin } from "@quikit/auth/require-admin";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getQuikAssetAppId } from "@/lib/api/permissions";
import { isRemovedFromQuikAsset } from "@/lib/api/removal";

/**
 * Recognises both the legacy membership-tier admin AND a QuikAsset RBAC v2
 * system-admin grant. A user promoted to admin via the in-app role UI keeps
 * `OrgMember.role = "member"`, so the bare tier check would 403 them — the
 * `extraAdminCheck` bridges that gap.
 */
const baseRequireAdmin = createRequireAdmin(authOptions, {
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

/**
 * requireAdmin + soft-delete gate: a user removed from QuikAsset is denied even
 * if they still hold an admin row (rows are retained for audit).
 */
export async function requireAdmin() {
  const res = await baseRequireAdmin();
  if ("error" in res) return res;
  if (await isRemovedFromQuikAsset(res.userId, res.orgId)) {
    return {
      error: NextResponse.json(
        { success: false, error: "Your access to QuikAsset has been removed." },
        { status: 403 },
      ),
    };
  }
  return res;
}
