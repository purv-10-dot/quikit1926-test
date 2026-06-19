/**
 * PATCH /api/org/users/[id]/role
 *
 * Single-role swap.
 *   Body: { roleId: string, enableSettings?: boolean }
 *
 * The "id" param is auth.User.id (central). The route:
 *   1. Runs assertWouldNotEmptyAdmin to refuse demoting the only admin
 *   2. Removes the user's existing CnUserAppRole rows for this org
 *      (single-role model per user — multi-role can be added later)
 *   3. Inserts the new assignment
 *   4. Reconciles the 4 settings-related CnUserPermissionExtra rows:
 *        - if roleId resolves to "admin" AND enableSettings = true
 *          → upsert 4 settings extras
 *        - otherwise (different role, OR company_admin without checkbox)
 *          → delete any existing settings extras
 *
 * Admin-only.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@quikit/database";
import { requireAdmin } from "@/lib/rbac/requireAdmin";
import { AdminLockoutError, assertWouldNotEmptyAdmin } from "@/lib/rbac/preventAdminLockout";

const SETTINGS_PERMS = [
  { resource: "construction.settings", action: "manage" },
  { resource: "construction.users", action: "manage" },
  { resource: "construction.roles", action: "manage" },
  { resource: "construction.workflows", action: "manage" },
];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId, userId: actingUserId } = ctxOrResponse;

    const targetUserId = params.id;
    const body = (await req.json()) as {
      roleId?: unknown;
      enableSettings?: unknown;
    };
    if (typeof body.roleId !== "string" || !body.roleId) {
      return NextResponse.json({ success: false, error: "roleId is required" }, { status: 400 });
    }
    const roleId = body.roleId;
    const enableSettings = body.enableSettings === true;

    const role = await db.cnAppRole.findFirst({
      where: { id: roleId, orgId },
      select: { id: true, name: true, isSystem: true },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found in this org" }, { status: 404 });
    }

    // If the swap would demote the only admin, this throws AdminLockoutError.
    await assertWouldNotEmptyAdmin({ orgId, userId: targetUserId });

    await db.$transaction([
      db.cnUserAppRole.deleteMany({ where: { userId: targetUserId, orgId } }),
      db.cnUserAppRole.create({
        data: { userId: targetUserId, orgId, roleId, assignedBy: actingUserId },
      }),
    ]);

    // Reconcile settings-access extras. The new role + checkbox combo
    // determines whether the user keeps Settings access:
    //   role = company_admin AND enableSettings = true  → keep / add extras
    //   anything else                                    → strip extras
    const grantSettings = role.name === "admin" && enableSettings;
    if (grantSettings) {
      for (const p of SETTINGS_PERMS) {
        await db.cnUserPermissionExtra.upsert({
          where: {
            orgId_userId_resource_action: {
              orgId,
              userId: targetUserId,
              resource: p.resource,
              action: p.action,
            },
          },
          update: {},
          create: {
            orgId,
            userId: targetUserId,
            resource: p.resource,
            action: p.action,
            grantedBy: actingUserId,
          },
        });
      }
    } else {
      // Remove any old settings extras the user may have had.
      await db.cnUserPermissionExtra.deleteMany({
        where: {
          orgId,
          userId: targetUserId,
          OR: SETTINGS_PERMS.map((p) => ({ resource: p.resource, action: p.action })),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { userId: targetUserId, roleId, settingsAccess: grantSettings },
    });
  } catch (error: unknown) {
    if (error instanceof AdminLockoutError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to assign role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
