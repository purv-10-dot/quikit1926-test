import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import {
  FIELD_LEVELS,
  isCatalogField,
  isFieldLevel,
  type FieldLevel,
} from "@/lib/api/fieldsRegistry";

const putSchema = z.object({
  permissions: z.array(
    z.object({
      entity: z.string().min(1),
      field: z.string().min(1),
      level: z.enum(FIELD_LEVELS),
    }),
  ),
});

// GET /api/projects/[id]/roles/[roleId]/field-permissions
// Returns saved (entity, field, level) rows for a Layer-2 project role.
// Absence of a row means the field defaults to "editable".
export const GET = withProjectAccess<{ id: string; roleId: string }>(
  async ({ projectId }, _req, { params }) => {
    try {
      const role = await db.qtProjectRole.findFirst({
        where: { id: params.roleId, projectId },
        select: { id: true },
      });
      if (!role) {
        return NextResponse.json(
          { success: false, error: "Role not found" },
          { status: 404 },
        );
      }
      const rows = await db.qtProjectRoleFieldPermission.findMany({
        where: { projectRoleId: role.id },
        select: { entity: true, field: true, level: true },
        orderBy: [{ entity: "asc" }, { field: "asc" }],
      });
      return NextResponse.json({
        success: true,
        data: {
          roleId: role.id,
          permissions: rows.map((r) => ({
            entity: r.entity,
            field: r.field,
            level: r.level as FieldLevel,
          })),
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to load field permissions";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);

// PUT /api/projects/[id]/roles/[roleId]/field-permissions — atomic replace.
// Clients omit `editable` rows (the default) to keep the table compact.
export const PUT = withProjectAccess<{ id: string; roleId: string }>(
  async ({ projectId }, req: NextRequest, { params }) => {
    try {
      const parsed = putSchema.safeParse(await req.json());
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
        return NextResponse.json(
          { success: false, error: "Role not found" },
          { status: 404 },
        );
      }
      // Filter to catalog-valid (entity, field) pairs only — protects against
      // a stale field key from an older registry breaking the save.
      const valid = parsed.data.permissions.filter(
        (p) => isCatalogField(p.entity, p.field) && isFieldLevel(p.level),
      );
      await db.$transaction([
        db.qtProjectRoleFieldPermission.deleteMany({
          where: { projectRoleId: role.id },
        }),
        db.qtProjectRoleFieldPermission.createMany({
          data: valid.map((p) => ({
            projectRoleId: role.id,
            entity: p.entity,
            field: p.field,
            level: p.level,
          })),
          skipDuplicates: true,
        }),
      ]);
      return NextResponse.json({ success: true, data: { count: valid.length } });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to save field permissions";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id" },
);
