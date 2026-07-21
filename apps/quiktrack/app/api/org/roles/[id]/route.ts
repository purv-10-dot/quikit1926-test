import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikTrackAppId } from "@/lib/api/permissions";
import { SPACE_CREATOR_ROLE_NAME } from "@/lib/api/permissionsRegistry";

const patchRoleSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/org/roles/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikTrackAppId();
    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, ...(appId ? { appId } : {}) },
      include: {
        permissions: { select: { resource: true, action: true } },
        navigations: { select: { navKey: true } },
        _count: { select: { members: true } },
      },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/org/roles/[id] â€” rename / update description / set default.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const parsed = patchRoleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const appId = await getQuikTrackAppId();
    const existing = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, ...(appId ? { appId } : {}) },
      select: { id: true, isSystem: true, name: true, appId: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }
    if (existing.isSystem) {
      return NextResponse.json(
        { success: false, error: "System roles cannot be modified" },
        { status: 400 },
      );
    }

    const data = parsed.data;
    if (data.name && data.name !== existing.name) {
      const dup = await db.qtAppRole.findUnique({
        where: { orgId_appId_name: { orgId, appId: existing.appId, name: data.name } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { success: false, error: `Role "${data.name}" already exists` },
          { status: 409 },
        );
      }
    }

    if (data.isDefault === true) {
      await db.qtAppRole.updateMany({
        where: { orgId, appId: existing.appId, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }

    const updated = await db.qtAppRole.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? undefined,
        description: data.description !== undefined ? data.description : undefined,
        isDefault: data.isDefault ?? undefined,
      },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// DELETE /api/org/roles/[id] â€” delete a non-system role.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikTrackAppId();
    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, ...(appId ? { appId } : {}) },
      select: {
        id: true,
        name: true,
        isSystem: true,
        isDefault: true,
        _count: { select: { members: true } },
      },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }
    // Protected org roles — Admin (isSystem), the default (Member), and Space
    // Creator — can NEVER be deleted. Every other role (Project Manager, custom)
    // remains deletable.
    if (role.isSystem || role.isDefault || role.name === SPACE_CREATOR_ROLE_NAME) {
      return NextResponse.json(
        { success: false, error: `The "${role.name}" role can't be deleted.` },
        { status: 400 },
      );
    }

    const affectedUsers = role._count.members;
    await db.qtAppRole.delete({ where: { id: role.id } });

    return NextResponse.json({
      success: true,
      data: { id: role.id, affectedUsers },
      message:
        affectedUsers > 0
          ? `Role deleted. ${affectedUsers} user(s) lost their role assignment.`
          : "Role deleted.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
