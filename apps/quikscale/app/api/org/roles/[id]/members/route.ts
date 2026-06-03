import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import { assertReconcileLeavesAdminPopulated, AdminLockoutError } from "@/lib/api/preventAdminLockout";

// RBAC v2: gated by the `User` resource. Assigning users to a role rides
// on the same User CRUD grants. Admin-lockout guard
// (`assertReconcileLeavesAdminPopulated`) is preserved on PUT so the last
// admin can never be detached from the admin role.
const auth = withOrgAuthForResource("orgSetup.users", "User");

const putBodySchema = z.object({
  /** Full desired set of userIds assigned to this role. Server reconciles. */
  userIds: z.array(z.string().min(1)),
});

/**
 * Storage model (post-rename):
 *   - Roles → app_quikscale.AppRole
 *   - Members → app_quikscale.UserAppRole (join table; replaces the
 *     `appRoleId` column that used to live on quikit.UserAppAccess).
 *
 * Pre-condition for membership: the user must already have a
 * quikit.UserAppAccess row for QuikScale. Users without one are skipped
 * in PUT and reported back so the UI can prompt to invite them first.
 */

// GET /api/org/roles/[id]/members — list users currently on this AppRole.
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const role = await db.appRole.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, appId: true },
  });
  if (!role) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 404 },
    );
  }

  const userRoles = await db.userAppRole.findMany({
    where: { roleId: role.id, orgId },
    select: { userId: true },
  });
  const userIds = userRoles.map((u) => u.userId);
  const users =
    userIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];

  return NextResponse.json({
    success: true,
    data: { roleId: role.id, members: users },
  });
}, { fallbackErrorMessage: "Failed to fetch members" });

// PUT /api/org/roles/[id]/members
// Reconcile: every userId in the body should END UP linked to this role.
// Users currently on this role but NOT in the body are removed.
// Users in the body who don't yet have a UserAppAccess row for QuikScale
// are skipped and reported back — admin must invite them first.
export const PUT = auth.update<{ id: string }>(async ({ orgId, userId: actorId }, req, { params }) => {
  const parsed = putBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.errors[0]?.message ?? "Invalid input",
      },
      { status: 400 },
    );
  }

  const role = await db.appRole.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, appId: true },
  });
  if (!role) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 404 },
    );
  }

  const appId = await getQuikScaleAppId();
  if (!appId || appId !== role.appId) {
    return NextResponse.json(
      { success: false, error: "App mismatch" },
      { status: 500 },
    );
  }

  const desired = Array.from(new Set(parsed.data.userIds));

  // v2: refuse to reconcile the admin role to an empty membership.
  try {
    await assertReconcileLeavesAdminPopulated({ orgId, roleId: role.id, nextUserIds: desired });
  } catch (e) {
    if (e instanceof AdminLockoutError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    }
    throw e;
  }

  const result = await db.$transaction(async (tx) => {
    // 1. Filter desired set to users with QuikScale UserAppAccess.
    const access =
      desired.length > 0
        ? await tx.userAppAccess.findMany({
            where: { orgId, appId, userId: { in: desired } },
            select: { userId: true },
          })
        : [];
    const eligibleSet = new Set(access.map((a) => a.userId));
    const eligible = desired.filter((u) => eligibleSet.has(u));
    const skippedUserIds = desired.filter((u) => !eligibleSet.has(u));

    // 2. Detach UserAppRole rows for users no longer in the desired set.
    const detached = await tx.userAppRole.deleteMany({
      where: {
        roleId: role.id,
        orgId,
        userId: eligible.length > 0 ? { notIn: eligible } : undefined,
      },
    });

    // 3. Attach UserAppRole rows for newly-desired users.
    const existing = await tx.userAppRole.findMany({
      where: { roleId: role.id, orgId, userId: { in: eligible } },
      select: { userId: true },
    });
    const existingSet = new Set(existing.map((e) => e.userId));
    const toCreate = eligible.filter((u) => !existingSet.has(u));
    let attached = 0;
    for (const userId of toCreate) {
      await tx.userAppRole.create({
        data: {
          userId,
          orgId,
          roleId: role.id,
          assignedBy: actorId,
        },
      });
      attached++;
    }

    return {
      detached: detached.count,
      attached,
      skippedUserIds,
    };
  });

  return NextResponse.json({
    success: true,
    data: { roleId: role.id, ...result },
  });
}, { fallbackErrorMessage: "Failed to update role members" });
