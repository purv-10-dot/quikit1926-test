import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject } from "@/lib/api/permissions";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/projects/[id]/roles/[roleId]
export const GET = withProjectAccess<{ id: string; roleId: string }>(async ({ projectId }, _req, { params }) => {
  const role = await db.qtProjectRole.findFirst({
    where: { id: params.roleId, projectId },
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
}, { paramKey: "id" });

// PATCH /api/projects/[id]/roles/[roleId]
export const PATCH = withProjectAccess<{ id: string; roleId: string }>(async (
  { orgId, projectId, userId, isTenantAdmin },
  req,
  { params },
) => {
  if (
    !isTenantAdmin &&
    !(await userCanInProject(userId, orgId, projectId, "ProjectMember", "update"))
  ) {
    return NextResponse.json({ success: false, error: "You don't have permission to edit project roles" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const existing = await db.qtProjectRole.findFirst({
    where: { id: params.roleId, projectId },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }

  const data = parsed.data;
  if (data.name && data.name !== existing.name) {
    const dup = await db.qtProjectRole.findUnique({
      where: { projectId_name: { projectId, name: data.name } },
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
    await db.qtProjectRole.updateMany({
      where: { projectId, isDefault: true, id: { not: existing.id } },
      data: { isDefault: false },
    });
  }

  const updated = await db.qtProjectRole.update({
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
      isDefault: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}, { paramKey: "id" });

// DELETE /api/projects/[id]/roles/[roleId]
export const DELETE = withProjectAccess<{ id: string; roleId: string }>(async (
  { orgId, projectId, userId, isTenantAdmin },
  _req,
  { params },
) => {
  if (
    !isTenantAdmin &&
    !(await userCanInProject(userId, orgId, projectId, "ProjectMember", "update"))
  ) {
    return NextResponse.json({ success: false, error: "You don't have permission to delete project roles" }, { status: 403 });
  }

  const role = await db.qtProjectRole.findFirst({
    where: { id: params.roleId, projectId },
    select: { id: true, _count: { select: { members: true } } },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }

  const affectedUsers = role._count.members;
  await db.qtProjectRole.delete({ where: { id: role.id } });

  return NextResponse.json({
    success: true,
    data: { id: role.id, affectedUsers },
    message:
      affectedUsers > 0
        ? `Role deleted. ${affectedUsers} member(s) lost their project role.`
        : "Role deleted.",
  });
}, { paramKey: "id" });
