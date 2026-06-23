import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { requirePermission } from "@/lib/auth/require-permission";

export const runtime = "nodejs";

const updateSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().max(120).optional().nullable(),
  config: z.record(z.unknown()).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === "P2002";
}

// Confirm the row belongs to the caller's org before mutating. Prevents a
// cross-tenant id from being PATCHed/DELETEd (rule #5: every query is
// tenant-scoped).
async function findOwned(orgId: string, id: string) {
  return prisma.crmActivityType.findFirst({ where: { id, orgId } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const { id } = await params;
    const existing = await findOwned(user.orgId, id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Activity type not found" },
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

    const data: Prisma.CrmActivityTypeUpdateInput = {};
    if (parsed.data.label !== undefined) data.label = parsed.data.label;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if (parsed.data.config !== undefined)
      data.config = parsed.data.config as Prisma.InputJsonValue;
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

    try {
      const item = await prisma.crmActivityType.update({ where: { id }, data });
      return NextResponse.json({ success: true, data: item });
    } catch (e) {
      if (isUniqueViolation(e)) {
        return NextResponse.json(
          { success: false, error: "An activity type with this code already exists" },
          { status: 409 },
        );
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await requirePermission(user, "settings", "edit");

    const { id } = await params;
    const existing = await findOwned(user.orgId, id);
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Activity type not found" },
        { status: 404 },
      );
    }

    // Field definitions cascade-delete via the FK onDelete: Cascade.
    await prisma.crmActivityType.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (e) {
    return errorResponse(e);
  }
}
