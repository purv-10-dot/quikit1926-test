import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { isAdminRole } from "@/lib/api/permissions";
import { getQuikSupportAppId } from "@/lib/api/seedAppRole";
import { seedAdminAppRole, ensureUserOnRole } from "@/lib/api/seedAppRole";
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";

const bodySchema = z.object({
  /** QspAppRole.id, or null to revoke. Special "admin" auto-seeds the admin role. */
  roleId: z.string().min(1).nullable(),
});

// PATCH /api/org/users/[id]/role — assign / revoke a user's standard-RBAC role.
// Single-role model per (userId, orgId, app). Mirrors quiktrack.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as { orgId: string; userId: string };

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { roleId: requestedRoleId } = parsed.data;

    const appId = await getQuikSupportAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikSupport app not registered" },
        { status: 500 },
      );
    }

    let targetRoleId: string | null = null;
    let targetIsAdmin = false;
    if (requestedRoleId === "admin") {
      targetRoleId = await seedAdminAppRole(orgId);
      targetIsAdmin = true;
    } else if (requestedRoleId) {
      const role = await db.qspAppRole.findFirst({
        where: { id: requestedRoleId, orgId, appId },
        select: { id: true, isSystem: true, name: true },
      });
      if (!role) {
        return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
      }
      targetRoleId = role.id;
      targetIsAdmin = isAdminRole(role);
    }

    // Admin-lockout guard: would this swap leave 0 admins?
    const currentRoles = await db.qspUserAppRole.findMany({
      where: { userId: params.id, orgId, role: { appId } },
      select: { role: { select: { id: true, isSystem: true, name: true } } },
    });
    const userIsAdmin = currentRoles.some((ur) => isAdminRole(ur.role));
    if (userIsAdmin && !targetIsAdmin) {
      const adminCount = await db.qspUserAppRole.count({
        where: { orgId, role: { appId, isSystem: true, name: "admin" } },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: "Cannot remove the last admin from the organisation." },
          { status: 409 },
        );
      }
    }

    // Single-role model: drop existing assignments for this app, then set the new one.
    await db.qspUserAppRole.deleteMany({
      where: { userId: params.id, orgId, role: { appId } },
    });
    if (targetRoleId) {
      await ensureUserOnRole(params.id, orgId, targetRoleId, actorId);
    }

    const role = targetRoleId
      ? await db.qspAppRole.findUnique({
          where: { id: targetRoleId },
          select: { id: true, name: true },
        })
      : null;

    // Keep the central UserAppAccess.role mirror (what the Admin Portal shows)
    // in sync with the role just assigned in QuikSupport.
    await mirrorAppRoleToCentral(db, {
      orgId,
      userId: params.id,
      appId,
      roleName: role?.name,
    });

    return NextResponse.json({
      success: true,
      data: { userId: params.id, appRoleId: targetRoleId, appRole: role },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
