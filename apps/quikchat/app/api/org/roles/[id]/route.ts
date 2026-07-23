import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz/requireAdmin";
import { assertRoleDeletable, AdminLockoutError } from "@/lib/authz/preventAdminLockout";

export const dynamic = "force-dynamic";

const patchRoleSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

type Params = { params: { id: string } };

// GET /api/org/roles/[id] — one role with its full permission list.
export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;
  try {
    const role = await db.qcAppRole.findFirst({
      where: { id: params.id, orgId },
      include: {
        permissions: { select: { resource: true, action: true } },
        _count: { select: { members: true } },
      },
    });
    if (!role) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: role });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PATCH /api/org/roles/[id] — rename / description / default. Blocks isSystem.
export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;
  try {
    const parsed = patchRoleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const existing = await db.qcAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, isSystem: true, name: true, appId: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    if (existing.isSystem) {
      return NextResponse.json({ success: false, error: "System roles cannot be modified" }, { status: 400 });
    }

    const data = parsed.data;
    if (data.name && data.name !== existing.name) {
      const dup = await db.qcAppRole.findUnique({
        where: { orgId_appId_name: { orgId, appId: existing.appId, name: data.name } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json({ success: false, error: `Role "${data.name}" already exists` }, { status: 409 });
      }
    }

    if (data.isDefault === true) {
      await db.qcAppRole.updateMany({
        where: { orgId, appId: existing.appId, isDefault: true, id: { not: existing.id } },
        data: { isDefault: false },
      });
    }

    const updated = await db.qcAppRole.update({
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

// DELETE /api/org/roles/[id] — delete a non-system role (CASCADE clears grants +
// member links). Blocks isSystem and reports affected member count.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;
  try {
    let memberCount: number;
    try {
      ({ memberCount } = await assertRoleDeletable({ orgId, roleId: params.id }));
    } catch (e) {
      if (e instanceof AdminLockoutError) {
        return NextResponse.json({ success: false, error: e.message }, { status: 400 });
      }
      throw e;
    }

    await db.qcAppRole.delete({ where: { id: params.id } });

    return NextResponse.json({
      success: true,
      data: { id: params.id, affectedUsers: memberCount },
      message:
        memberCount > 0
          ? `Role deleted. ${memberCount} user(s) lost their role assignment.`
          : "Role deleted.",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
