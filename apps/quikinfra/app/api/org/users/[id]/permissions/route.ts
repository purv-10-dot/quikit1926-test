/**
 * GET  /api/org/users/[id]/permissions
 *   Returns the user's role grants + extras (split, with `isExtra` flag).
 *
 * POST /api/org/users/[id]/permissions
 *   Replaces the user's UserPermissionExtra rows atomically.
 *   Body: { extras: Array<{ resource: string, action: string }> }
 *
 * "id" param is auth.User.id. Admin-only.
 *
 * Extras add to role grants; they cannot revoke a role-granted permission.
 * If the role grants resource:action and extras don't, the user still has it.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@quikit/database";
import { requireAdmin } from "@/lib/rbac/requireAdmin";
import { isValidPermissionPair } from "@/lib/rbac/permissionsRegistry";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;
    const targetUserId = params.id;

    const assignment = await db.cnUserAppRole.findFirst({
      where: { userId: targetUserId, orgId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            rolePermissions: { select: { resource: true, action: true } },
          },
        },
      },
    });
    const extras = await db.cnUserPermissionExtra.findMany({
      where: { userId: targetUserId, orgId },
      select: { resource: true, action: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        roleId: assignment?.role.id ?? null,
        roleName: assignment?.role.name ?? null,
        rolePermissions: assignment?.role.rolePermissions ?? [],
        extras,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load user permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId, userId: actingUserId } = ctxOrResponse;
    const targetUserId = params.id;

    const body = (await req.json()) as { extras?: unknown };
    if (!Array.isArray(body.extras)) {
      return NextResponse.json({ success: false, error: "extras[] is required" }, { status: 400 });
    }

    const pairs: Array<{ resource: string; action: string }> = [];
    for (const p of body.extras) {
      if (!p || typeof p !== "object") {
        return NextResponse.json({ success: false, error: "Malformed extra entry" }, { status: 400 });
      }
      const obj = p as { resource?: unknown; action?: unknown };
      if (typeof obj.resource !== "string" || typeof obj.action !== "string") {
        return NextResponse.json({ success: false, error: "resource/action must be strings" }, { status: 400 });
      }
      if (!isValidPermissionPair(obj.resource, obj.action)) {
        return NextResponse.json(
          { success: false, error: `Unknown permission: ${obj.resource}:${obj.action}` },
          { status: 400 },
        );
      }
      pairs.push({ resource: obj.resource, action: obj.action });
    }

    await db.$transaction([
      db.cnUserPermissionExtra.deleteMany({ where: { userId: targetUserId, orgId } }),
      db.cnUserPermissionExtra.createMany({
        data: pairs.map((p) => ({
          userId: targetUserId,
          orgId,
          resource: p.resource,
          action: p.action,
          grantedBy: actingUserId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({ success: true, data: { extras: pairs } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update extras";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
