import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
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

// GET /api/org/roles/[id]/field-permissions
// Returns the saved (entity, field, level) rows for a Layer-1 app role.
// Missing rows mean "default" — clients should treat them as `editable`.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!role) {
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 404 },
      );
    }

    const rows = await db.qtRoleFieldPermission.findMany({
      where: { roleId: role.id },
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
    const message = error instanceof Error ? error.message : "Failed to load field permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/org/roles/[id]/field-permissions
// Replaces the entire (entity, field, level) set for the role. Only rows
// that differ from the default level are stored — clients should omit
// `editable` entries from the payload to keep the table compact.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const parsed = putSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!role) {
      return NextResponse.json(
        { success: false, error: "Role not found" },
        { status: 404 },
      );
    }

    // Filter to catalog-valid (entity, field) pairs only — protects against
    // a renamed field key leaking into the table.
    const valid = parsed.data.permissions.filter(
      (p) => isCatalogField(p.entity, p.field) && isFieldLevel(p.level),
    );

    await db.$transaction([
      db.qtRoleFieldPermission.deleteMany({ where: { roleId: role.id } }),
      db.qtRoleFieldPermission.createMany({
        data: valid.map((p) => ({
          roleId: role.id,
          entity: p.entity,
          field: p.field,
          level: p.level,
        })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({ success: true, data: { count: valid.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save field permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
