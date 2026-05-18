import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { isNavKey } from "@/lib/api/permissionsRegistry";

const putBodySchema = z.object({
  navKeys: z.array(z.string().refine(isNavKey, "Unknown nav key")),
});

// GET /api/projects/[id]/roles/[roleId]/navigation
export const GET = withProjectAccess<{ id: string; roleId: string }>(async ({ projectId }, _req, { params }) => {
  const role = await db.qtProjectRole.findFirst({
    where: { id: params.roleId, projectId },
    select: {
      id: true,
      navigations: { select: { navKey: true } },
    },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
  }
  return NextResponse.json({
    success: true,
    data: { roleId: role.id, navKeys: role.navigations.map((n) => n.navKey) },
  });
}, { paramKey: "id" });

// PUT /api/projects/[id]/roles/[roleId]/navigation — atomic replace into
// the dedicated QtProjectRoleNavigation table.
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

  const desired = Array.from(new Set(parsed.data.navKeys));

  await db.$transaction([
    db.qtProjectRoleNavigation.deleteMany({ where: { projectRoleId: role.id } }),
    ...(desired.length > 0
      ? [
          db.qtProjectRoleNavigation.createMany({
            data: desired.map((navKey) => ({ projectRoleId: role.id, navKey })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    success: true,
    data: { roleId: role.id, count: desired.length },
  });
}, { paramKey: "id" });
