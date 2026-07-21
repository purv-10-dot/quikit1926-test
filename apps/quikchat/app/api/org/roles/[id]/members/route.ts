import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz/requireAdmin";
import { getQuikChatAppId } from "@/lib/authz/permissions";
import { assertReconcileLeavesAdminPopulated, AdminLockoutError } from "@/lib/authz/preventAdminLockout";

export const dynamic = "force-dynamic";

const putBodySchema = z.object({
  userIds: z.array(z.string().min(1)),
});

type Params = { params: { id: string } };

/**
 * Members of a QcAppRole (join = QcUserAppRole). Membership is role-centric
 * (edit a role's member set) — QuikChat has no per-user Users tab. Pre-condition
 * to add a user: they must already hold a quikit.UserAppAccess row for QuikChat
 * (users without one are skipped in PUT and reported back).
 */

// GET /api/org/roles/[id]/members — users currently on this role.
export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;
  try {
    const role = await db.qcAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, appId: true },
    });
    if (!role) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

    const userRoles = await db.qcUserAppRole.findMany({
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

    return NextResponse.json({ success: true, data: { roleId: role.id, members: users } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch members";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/org/roles/[id]/members — reconcile the member set. Users not in the
// body are detached; new users are attached (skipping those without a QuikChat
// UserAppAccess row, reported back). Admin-lockout guard on the admin role.
export async function PUT(req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId, userId: actorId } = gate;
  try {
    const parsed = putBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const role = await db.qcAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, appId: true },
    });
    if (!role) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

    const appId = await getQuikChatAppId();
    if (!appId || appId !== role.appId) {
      return NextResponse.json({ success: false, error: "App mismatch" }, { status: 500 });
    }

    const desired = Array.from(new Set(parsed.data.userIds));

    // Refuse to reconcile the admin role to an empty membership.
    try {
      await assertReconcileLeavesAdminPopulated({ orgId, roleId: role.id, nextUserIds: desired });
    } catch (e) {
      if (e instanceof AdminLockoutError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 409 });
      }
      throw e;
    }

    const result = await db.$transaction(async (tx) => {
      // 1. Filter desired to users with a QuikChat UserAppAccess row.
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

      // 2. Detach rows for users no longer desired.
      const detached = await tx.qcUserAppRole.deleteMany({
        where: {
          roleId: role.id,
          orgId,
          userId: eligible.length > 0 ? { notIn: eligible } : undefined,
        },
      });

      // 3. Attach rows for newly-desired users (inline create, single-role
      //    invariant honored elsewhere via collapseToLatestRole).
      const existing = await tx.qcUserAppRole.findMany({
        where: { roleId: role.id, orgId, userId: { in: eligible } },
        select: { userId: true },
      });
      const existingSet = new Set(existing.map((e) => e.userId));
      const toCreate = eligible.filter((u) => !existingSet.has(u));
      let attached = 0;
      for (const uid of toCreate) {
        await tx.qcUserAppRole.create({
          data: { userId: uid, orgId, roleId: role.id, assignedBy: actorId },
        });
        attached++;
      }

      return { detached: detached.count, attached, skippedUserIds };
    });

    return NextResponse.json({ success: true, data: { roleId: role.id, ...result } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update role members";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
