import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";

export const runtime = "nodejs";

// Edit / delete a single field definition by its key, scoped to its parent
// activity type. Admin-gated like the rest of the module. fieldType is NOT
// editable after creation (matches the lead/product FieldEditorModal rule that
// type is fixed once a field exists — changing it would orphan stored values).
const updateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  requirement: z.enum(["Required", "Optional"]).optional(),
  options: z.array(z.string().trim().min(1)).optional(),
  visible: z.boolean().optional(),
  helpText: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

// Confirm the field belongs to the given type AND the caller's org before
// mutating — blocks cross-tenant and cross-type access in one query.
async function findOwnedField(orgId: string, activityTypeId: string, key: string) {
  return prisma.crmActivityFieldDefinition.findFirst({
    where: { orgId, activityTypeId, key },
    select: { id: true },
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const { id, key } = await params;
    const existing = await findOwnedField(user.orgId, id, key);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Field not found" },
        { status: 404 },
      );
    }

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid body",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data: Prisma.CrmActivityFieldDefinitionUpdateInput = {};
    if (parsed.data.label !== undefined) data.label = parsed.data.label;
    if (parsed.data.requirement !== undefined) data.requirement = parsed.data.requirement;
    if (parsed.data.options !== undefined)
      data.options = parsed.data.options as Prisma.InputJsonValue;
    if (parsed.data.visible !== undefined) data.visible = parsed.data.visible;
    if (parsed.data.helpText !== undefined) data.helpText = parsed.data.helpText;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;

    const item = await prisma.crmActivityFieldDefinition.update({
      where: { id: existing.id },
      data,
    });
    return NextResponse.json({ success: true, data: item });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; key: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const { id, key } = await params;
    const existing = await findOwnedField(user.orgId, id, key);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Field not found" },
        { status: 404 },
      );
    }

    await prisma.crmActivityFieldDefinition.delete({ where: { id: existing.id } });
    return NextResponse.json({ success: true, data: { id: id, key } });
  } catch (e) {
    return errorResponse(e);
  }
}
