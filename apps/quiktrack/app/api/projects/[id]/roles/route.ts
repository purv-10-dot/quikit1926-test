import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { userCanInProject, forbidden } from "@/lib/api/permissions";

const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/projects/[id]/roles — list every project role for this project.
export const GET = withProjectAccess(async ({ orgId, projectId }) => {
  const roles = await db.qtProjectRole.findMany({
    where: { orgId, projectId },
    select: {
      id: true,
      name: true,
      description: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { permissions: true, navigations: true, members: true } },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ success: true, data: roles });
}, { paramKey: "id" });

// POST /api/projects/[id]/roles — create a new project role.
// Project admins (tenant admin or project PROJECT_ADMIN) only.
export const POST = withProjectAccess(async ({ orgId, projectId, userId, isTenantAdmin }, req) => {
  if (
    !isTenantAdmin &&
    !(await userCanInProject(userId, orgId, projectId, "ProjectMember", "update"))
  ) {
    return NextResponse.json(
      { success: false, error: "You don't have permission to manage project roles" },
      { status: 403 },
    );
  }

  const parsed = createRoleSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const { name, description, isDefault } = parsed.data;

  const dup = await db.qtProjectRole.findUnique({
    where: { projectId_name: { projectId, name } },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { success: false, error: `Role "${name}" already exists` },
      { status: 409 },
    );
  }

  if (isDefault) {
    await db.qtProjectRole.updateMany({
      where: { projectId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const role = await db.qtProjectRole.create({
    data: {
      orgId,
      projectId,
      name,
      description: description ?? null,
      isDefault: isDefault ?? false,
      createdBy: userId,
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

  return NextResponse.json({ success: true, data: role }, { status: 201 });
}, { paramKey: "id" });
