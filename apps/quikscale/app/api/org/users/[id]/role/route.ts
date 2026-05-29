import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import {
  seedAdminAppRole,
  ensureUserOnRole,
} from "@/lib/api/seedAdminAppRole";
import { assertWouldNotEmptyAdmin, AdminLockoutError } from "@/lib/api/preventAdminLockout";

// RBAC v2: assigning/revoking a user's app role mutates the user record, so
// it lives under the `User.update` grant (not `Role.update` — the role row
// itself is unchanged).
const auth = withOrgAuthForResource("orgSetup.users", "User");

const bodySchema = z.object({
  /** AppRole.id, or null to revoke. Special value "admin" auto-seeds + uses
   *  the org's admin AppRole (creating it on demand). */
  roleId: z.string().min(1).nullable(),
});

/**
 * PATCH /api/org/users/[id]/role
 *
 * Inline role-change endpoint used by the Users list dropdown.
 *
 * Storage model (post-rename, 2026-05-06):
 *   - Roles live in `app_quikscale.AppRole` (was `CustomRole`).
 *   - User → role mapping lives in `app_quikscale.UserAppRole` (a join
 *     table, replaces the `appRoleId` column that used to be on
 *     `quikit.UserAppAccess`).
 *
 * Pre-condition: the user must already have a `quikit.UserAppAccess` row
 * for QuikScale. If not, returns 409 — the admin must invite them first.
 */
export const PATCH = auth.update<{ id: string }>(async ({ orgId, userId: actorId }, req, { params }) => {
  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const { roleId: requestedRoleId } = parsed.data;

    const appId = await getQuikScaleAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikScale app not registered" },
        { status: 500 },
      );
    }

    // Pre-condition: user must already have QuikScale access.
    const access = await db.userAppAccess.findFirst({
      where: { orgId, appId, userId: params.id },
      select: { id: true },
    });
    if (!access) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This user does not have access to QuikScale yet. Add them as a user first, then assign a role.",
        },
        { status: 409 },
      );
    }

    // Resolve the target AppRole. `isV2Admin` drives the Phase-2 legacy
    // OrgMember.role sync below (revoke → false).
    let targetRoleId: string | null = null;
    let isV2Admin = false;
    if (requestedRoleId === "admin") {
      // Convenience path — auto-seed the admin role on demand.
      targetRoleId = await seedAdminAppRole(orgId);
      isV2Admin = true;
    } else if (requestedRoleId) {
      const role = await db.appRole.findFirst({
        where: { id: requestedRoleId, orgId, appId },
        select: { id: true, isSystem: true, name: true },
      });
      if (!role) {
        return NextResponse.json(
          { success: false, error: "Role not found" },
          { status: 404 },
        );
      }
      targetRoleId = role.id;
      isV2Admin = role.isSystem && role.name === "admin";
    }

    // v2: refuse if this swap would leave 0 users on the admin role.
    // No-ops when the user isn't currently an admin, OR when there are
    // other admins remaining.
    try {
      await assertWouldNotEmptyAdmin({ orgId, userId: params.id });
    } catch (e) {
      if (e instanceof AdminLockoutError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 409 });
      }
      throw e;
    }

    // Wipe any existing UserAppRole rows for this user (in this org), then
    // assign the new one. We treat it as single-role-at-a-time per the
    // dropdown UI even though the join supports multiples.
    await db.userAppRole.deleteMany({
      where: { userId: params.id, orgId },
    });
    if (targetRoleId) {
      await ensureUserOnRole(params.id, orgId, targetRoleId, actorId);
    }

    // OrgMember.role is intentionally pinned to "member" for every QuikScale
    // user — app-level authority (Admin / Manager / custom roles) lives in
    // app_quikscale.UserAppRole. The QuikScale `extraAdminCheck` bridge in
    // requireAdmin() reads v2 admin status directly from UserAppRole, so we
    // don't (and shouldn't) mirror "admin" back onto the legacy column.
    // Force-reset the legacy column to "member" so any previously promoted
    // rows converge.
    void isV2Admin;
    await db.orgMember.updateMany({
      where: { orgId, userId: params.id, role: { not: "member" } },
      data: { role: "member" },
    });

    // Hydrate response — include the role's id + name (or null if revoked).
    const role = targetRoleId
      ? await db.appRole.findUnique({
          where: { id: targetRoleId },
          select: { id: true, name: true },
        })
      : null;

    return NextResponse.json({
      success: true,
      data: {
        userId: params.id,
        appRoleId: targetRoleId,
        appRole: role,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update role";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
});
