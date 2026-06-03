/**
 * GET /api/org/roles/[id]/members  → list of users assigned to this role
 * PUT /api/org/roles/[id]/members  → reconcile members to exact set
 *
 * PUT body: { userIds: string[] }   (auth.User.id values)
 *
 * Admin lockout protected — refuses to empty the system "admin" role.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@quikit/database";
import { requireAdmin } from "@/lib/rbac/requireAdmin";
import {
  AdminLockoutError,
  assertReconcileLeavesAdminPopulated,
} from "@/lib/rbac/preventAdminLockout";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    const role = await db.cnAppRole.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const members = await db.cnUserAppRole.findMany({
      where: { roleId: params.id, orgId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { assignedAt: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: members.map((m) => ({
        userId: m.userId,
        email: m.user.email,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        assignedAt: m.assignedAt.toISOString(),
        assignedBy: m.assignedBy,
      })),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load members";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId, userId: actingUserId } = ctxOrResponse;

    const role = await db.cnAppRole.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const body = (await req.json()) as { userIds?: unknown };
    if (!Array.isArray(body.userIds) || !body.userIds.every((u) => typeof u === "string")) {
      return NextResponse.json(
        { success: false, error: "userIds[] of strings is required" },
        { status: 400 },
      );
    }
    const nextUserIds = body.userIds as string[];

    await assertReconcileLeavesAdminPopulated({ orgId, roleId: params.id, nextUserIds });

    // Reconcile atomically.
    await db.$transaction([
      db.cnUserAppRole.deleteMany({ where: { roleId: params.id, orgId } }),
      db.cnUserAppRole.createMany({
        data: nextUserIds.map((u) => ({ userId: u, orgId, roleId: params.id, assignedBy: actingUserId })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({ success: true, data: { count: nextUserIds.length } });
  } catch (error: unknown) {
    if (error instanceof AdminLockoutError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Failed to update members";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
