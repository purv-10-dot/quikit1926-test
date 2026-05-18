import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import {
  isAction,
  isResource,
  isValidPermissionPair,
} from "@/lib/api/permissionsRegistry";

const grantSchema = z
  .object({
    resource: z.string().refine(isResource, "Unknown resource"),
    action: z.string().refine(isAction, "Unknown action"),
  })
  .refine((g) => isValidPermissionPair(g.resource, g.action), {
    message: "(resource, action) pair is not valid for this leaf",
  });

const putBodySchema = z.object({ permissions: z.array(grantSchema) });

// GET /api/projects/[id]/roles/[roleId]/permissions
export const GET = withProjectAccess<{ id: string; roleId: string }>(async ({ projectId }, _req, { params }) => {
  const role = await db.qtProjectRole.findFirst({
    where: { id: params.roleId, projectId },
    select: {
      id: true,
      permissions: { select: { resource: true, action: true } },
    },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: { roleId: role.id, permissions: role.permissions },
  });
}, { paramKey: "id" });

// PUT /api/projects/[id]/roles/[roleId]/permissions — atomic replace.
// Project-role grants live in their own QtProjectRolePermission table
// (separate from app-wide QtRolePermission per the schema rule).
export const PUT = withProjectAccess<{ id: string; roleId: string }>(async (
  { projectId, projectRole, isTenantAdmin },
  req,
  { params },
) => {
  if (!isTenantAdmin && projectRole !== "PROJECT_ADMIN") {
    return NextResponse.json({ success: false, error: "Project admin required" }, { status: 403 });
  }

  const parsed = putBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const role = await db.qtProjectRole.findFirst({
    where: { id: params.roleId, projectId },
    select: { id: true },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }

  const seen = new Set<string>();
  const desired = parsed.data.permissions.filter((p) => {
    const k = `${p.resource}:${p.action}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  await db.$transaction([
    db.qtProjectRolePermission.deleteMany({ where: { projectRoleId: role.id } }),
    ...(desired.length > 0
      ? [
          db.qtProjectRolePermission.createMany({
            data: desired.map((p) => ({
              projectRoleId: role.id,
              resource: p.resource,
              action: p.action,
            })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    success: true,
    data: { roleId: role.id, count: desired.length },
  });
}, { paramKey: "id" });
