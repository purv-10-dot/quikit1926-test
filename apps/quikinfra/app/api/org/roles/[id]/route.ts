/**
 * GET    /api/org/roles/[id]            → role detail
 * PATCH  /api/org/roles/[id]            → rename / set isDefault. isSystem roles can't be renamed
 * DELETE /api/org/roles/[id]            → delete (system roles + lockout-protected)
 *
 * Body for PATCH: { name?: string, description?: string, isDefault?: boolean }
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac/requireAdmin";
import { AdminLockoutError, assertRoleDeletable } from "@/lib/rbac/preventAdminLockout";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    const role = await db.cnAppRole.findFirst({
      where: { id: params.id, orgId },
      include: { _count: { select: { members: true, rolePermissions: true } } },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
        isDefault: role.isDefault,
        memberCount: role._count.members,
        permissionCount: role._count.rolePermissions,
        createdAt: role.createdAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    const existing = await db.cnAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, isSystem: true, name: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const body = (await req.json()) as { name?: unknown; description?: unknown; isDefault?: unknown };
    const patch: { name?: string; description?: string | null; isDefault?: boolean } = {};

    if (typeof body.name === "string") {
      const next = body.name.trim();
      if (existing.isSystem && next !== existing.name) {
        return NextResponse.json(
          { success: false, error: "System roles cannot be renamed" },
          { status: 403 },
        );
      }
      patch.name = next;
    }
    if (typeof body.description === "string" || body.description === null) {
      patch.description = (body.description as string | null) ?? null;
    }
    if (typeof body.isDefault === "boolean") {
      patch.isDefault = body.isDefault;
    }

    // Only one default role at a time. When setting this one default, demote others.
    if (patch.isDefault === true) {
      await db.cnAppRole.updateMany({
        where: { orgId, isDefault: true, NOT: { id: existing.id } },
        data: { isDefault: false },
      });
    }

    const updated = await db.cnAppRole.update({
      where: { id: existing.id },
      data: patch,
      select: { id: true, name: true, description: true, isSystem: true, isDefault: true },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    if (error instanceof Error && /Unique constraint/.test(error.message)) {
      return NextResponse.json(
        { success: false, error: "A role with this name already exists" },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to update role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    await assertRoleDeletable({ orgId, roleId: params.id });

    await db.cnAppRole.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof AdminLockoutError) {
      const status = error.code === "NOT_FOUND" ? 404 : 409;
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status });
    }
    const message = error instanceof Error ? error.message : "Failed to delete role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
