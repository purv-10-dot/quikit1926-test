import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";

// RBAC v2: gated by the `User` resource. The `isSystem` check on PATCH/DELETE
// is preserved below so the admin role still can't be renamed or deleted
// regardless of grants.
const auth = withOrgAuthForResource("orgSetup.users", "User");

const patchRoleSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/org/roles/[id] — fetch one role with full permission list.
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const role = await db.appRole.findFirst({
    where: { id: params.id, orgId },
    include: {
      permissions: { select: { resource: true, action: true } },
      _count: { select: { members: true } },
    },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: role });
}, { fallbackErrorMessage: "Failed to fetch role" });

// PATCH /api/org/roles/[id] — rename / update description / set default.
export const PATCH = auth.update<{ id: string }>(async ({ orgId }, req, { params }) => {
  const parsed = patchRoleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const existing = await db.appRole.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, isSystem: true, name: true, appId: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }
  // System roles (admin) cannot be renamed or marked non-default.
  if (existing.isSystem) {
    return NextResponse.json(
      { success: false, error: "System roles cannot be modified" },
      { status: 400 },
    );
  }

  const data = parsed.data;
  // Name uniqueness within (tenant, app).
  if (data.name && data.name !== existing.name) {
    const dup = await db.appRole.findUnique({
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
    await db.appRole.updateMany({
      where: { orgId, appId: existing.appId, isDefault: true, id: { not: existing.id } },
      data: { isDefault: false },
    });
  }

  const updated = await db.appRole.update({
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
}, { fallbackErrorMessage: "Failed to update role" });

// DELETE /api/org/roles/[id] — delete a non-system role.
// CASCADE clears RolePermission + UserAppRole rows for this role.
export const DELETE = auth.delete<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const role = await db.appRole.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, isSystem: true, _count: { select: { members: true } } },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }
  if (role.isSystem) {
    return NextResponse.json(
      { success: false, error: "System roles cannot be deleted" },
      { status: 400 },
    );
  }

  // Confirm to caller how many users will be affected.
  const affectedUsers = role._count.members;

  await db.appRole.delete({ where: { id: role.id } });

  return NextResponse.json({
    success: true,
    data: { id: role.id, affectedUsers },
    message:
      affectedUsers > 0
        ? `Role deleted. ${affectedUsers} user(s) lost their role assignment.`
        : "Role deleted.",
  });
}, { fallbackErrorMessage: "Failed to delete role" });
