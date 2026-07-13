import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikAssetAppId, isAdminRole } from "@/lib/api/permissions";
import { seedAdminAppRole, ensureUserOnRole } from "@/lib/api/seedAppRoles";

const bodySchema = z.object({
  /** AstAppRole.id, or null to revoke. Special "admin" auto-seeds the admin role. */
  roleId: z.string().min(1).nullable(),
});

// PATCH /api/org/users/[id]/role
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

    const appId = await getQuikAssetAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikAsset app not registered" },
        { status: 500 },
      );
    }

    const access = await db.userAppAccess.findFirst({
      where: { orgId, appId, userId: params.id },
      select: { id: true },
    });
    if (!access) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This user does not have access to QuikAsset yet. Add them as a user first, then assign a role.",
        },
        { status: 409 },
      );
    }

    let targetRoleId: string | null = null;
    if (requestedRoleId === "admin") {
      targetRoleId = await seedAdminAppRole(orgId);
    } else if (requestedRoleId) {
      const role = await db.astAppRole.findFirst({
        where: { id: requestedRoleId, orgId, appId },
        select: { id: true },
      });
      if (!role) {
        return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
      }
      targetRoleId = role.id;
    }

    // Admin-lockout guard: would this swap leave 0 admins?
    const currentRoles = await db.astUserAppRole.findMany({
      where: { userId: params.id, orgId, role: { appId } },
      select: { role: { select: { id: true, isSystem: true, name: true } } },
    });
    const userIsAdmin = currentRoles.some((ur) => isAdminRole(ur.role));
    const targetRole = targetRoleId
      ? await db.astAppRole.findUnique({
          where: { id: targetRoleId },
          select: { isSystem: true, name: true },
        })
      : null;
    const targetIsAdmin = isAdminRole(targetRole);
    if (userIsAdmin && !targetIsAdmin) {
      const adminCount = await db.astUserAppRole.count({
        where: { orgId, role: { appId, isSystem: true, name: "admin" } },
      });
      if (adminCount <= 1) {
        return NextResponse.json(
          { success: false, error: "Cannot remove the last admin from the organisation." },
          { status: 409 },
        );
      }
    }

    await db.astUserAppRole.deleteMany({
      where: { userId: params.id, orgId, role: { appId } },
    });
    if (targetRoleId) {
      await ensureUserOnRole(params.id, orgId, targetRoleId, actorId);
    }

    const role = targetRoleId
      ? await db.astAppRole.findUnique({
          where: { id: targetRoleId },
          select: { id: true, name: true },
        })
      : null;

    return NextResponse.json({
      success: true,
      data: { userId: params.id, appRoleId: targetRoleId, appRole: role },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
