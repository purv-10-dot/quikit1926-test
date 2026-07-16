import { createRequireAdmin } from "@quikit/auth/require-admin";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getQuikChatAppId } from "./permissions";

/**
 * Admin bridge for QuikChat RBAC v2 (mirrors apps/quikscale/lib/api/requireAdmin.ts).
 *
 * The shared `createRequireAdmin` factory only knows the legacy platform tier
 * (OrgMember.role). A user promoted to admin purely via QuikChat's dynamic RBAC
 * (a `QcUserAppRole` → system `QcAppRole` named "admin") keeps their legacy
 * membership role, so the bare factory would 403 them. `extraAdminCheck`
 * recognises the v2 admin grant for THIS org's QuikChat app — lowercase
 * `"admin"`, matching the seeded row and `isOrgAdmin`.
 *
 * ⚠️ Phase 3 wiring: there is NO admin-tier route to gate yet (the assistant
 * config write has no route; org-KB ingest is gated grant-based via
 * `userCan("Assistant.IngestOrg", …)`). This bridge is the documented seam and
 * will be attached to a settings/admin-portal route in Phase 3. Unused for now
 * is intentional — do not force an artificial call site.
 */
export async function extraAdminCheck({
  userId,
  orgId,
}: {
  userId: string;
  orgId: string;
}): Promise<boolean> {
  const appId = await getQuikChatAppId();
  if (!appId) return false;
  const v2Admin = await db.qcUserAppRole.findFirst({
    where: { userId, orgId, role: { appId, isSystem: true, name: "admin" } },
    select: { id: true },
  });
  return !!v2Admin;
}

export const requireAdmin = createRequireAdmin(authOptions, { extraAdminCheck });
