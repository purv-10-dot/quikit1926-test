import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikTrackAppId, isAdminRole } from "@/lib/api/permissions";

const putBodySchema = z.object({
  userIds: z.array(z.string().min(1)),
});

// GET /api/org/roles/[id]/members â€” list users currently on this role.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikTrackAppId();
    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, ...(appId ? { appId } : {}) },
      select: { id: true, appId: true },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const userRoles = await db.qtUserAppRole.findMany({
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch members";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/org/roles/[id]/members â€” reconcile membership to the desired set.
// Users without a UserAppAccess row for QuikTrack are skipped + reported.
// Refuses to leave the admin role with zero members.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as { orgId: string; userId: string };

    const parsed = putBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const appId = await getQuikTrackAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikTrack app not registered" },
        { status: 500 },
      );
    }

    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, appId },
      select: { id: true, appId: true, isSystem: true, name: true },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const desired = Array.from(new Set(parsed.data.userIds));

    // Admin lockout guard â€” refuse to leave the admin role empty.
    if (isAdminRole(role) && desired.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot remove every member from the admin role.",
        },
        { status: 409 },
      );
    }

    const result = await db.$transaction(async (tx) => {
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

      const detached = await tx.qtUserAppRole.deleteMany({
        where: {
          roleId: role.id,
          orgId,
          userId: eligible.length > 0 ? { notIn: eligible } : undefined,
        },
      });

      const existing = await tx.qtUserAppRole.findMany({
        where: { roleId: role.id, orgId, userId: { in: eligible } },
        select: { userId: true },
      });
      const existingSet = new Set(existing.map((e) => e.userId));
      const toCreate = eligible.filter((u) => !existingSet.has(u));
      let attached = 0;
      for (const userId of toCreate) {
        await tx.qtUserAppRole.create({
          data: { userId, orgId, roleId: role.id, assignedBy: actorId },
        });
        attached++;
      }

      return { detached: detached.count, attached, skippedUserIds };
    });

    return NextResponse.json({
      success: true,
      data: { roleId: role.id, ...result },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update members";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
