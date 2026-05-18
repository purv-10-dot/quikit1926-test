import { db } from "@/lib/db";
import { ROLE_HIERARCHY } from "@quikit/shared";

const ADMIN_TIER = ROLE_HIERARCHY["admin"]; // 5

/**
 * Phase 2 source-fix for the dual-role desync.
 *
 * QuikScale promotes/demotes admins through dynamic-RBAC v2
 * (`UserAppRole` → system `AppRole`), which never touched the legacy
 * org-wide `OrgMember.role`. The shared role-tier `requireAdmin()` only
 * reads `OrgMember.role`, so v2-only admins 403'd everywhere. The Phase-1
 * `extraAdminCheck` bridge papers over that at read time; this keeps the
 * two systems in sync at WRITE time so the bridge only ever matters for
 * rows this sync hasn't reached (e.g. external `ensureUserOnRole` callers).
 *
 * Deliberately conservative and reversible — it ONLY flips between
 * `"member"` and `"admin"`, and ONLY when the user's org-wide role isn't
 * already a higher platform tier:
 *
 *   - Promote: write `"admin"` only if the current tier is BELOW admin
 *     (level < 5). A `super_admin`/`org_admin` is left untouched — we must
 *     not downgrade platform authority to the app-scoped `"admin"` string.
 *   - Demote: write `"member"` only if the current value is exactly the
 *     `"admin"` string this sync itself would have written. Any other
 *     value (`super_admin`, `org_admin`, `app_admin`, `executive`,
 *     `manager`, `employee`, `coach`) is platform/legacy authority this
 *     QuikScale-scoped dropdown does not own, so it is never stripped.
 *
 * No-ops when the user has no `OrgMember` row for this org.
 */
export async function syncLegacyAdminRole(opts: {
  orgId: string;
  userId: string;
  /** true → user now holds the QuikScale system-admin AppRole. */
  isV2Admin: boolean;
}): Promise<void> {
  const { orgId, userId, isV2Admin } = opts;

  const membership = await db.orgMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { role: true },
  });
  if (!membership) return;

  const currentLevel = ROLE_HIERARCHY[membership.role] ?? 0;

  if (isV2Admin) {
    if (currentLevel < ADMIN_TIER) {
      await db.orgMember.update({
        where: { orgId_userId: { orgId, userId } },
        data: { role: "admin" },
      });
    }
    return;
  }

  if (membership.role === "admin") {
    await db.orgMember.update({
      where: { orgId_userId: { orgId, userId } },
      data: { role: "member" },
    });
  }
}
