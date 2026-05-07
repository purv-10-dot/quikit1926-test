import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikScaleAppId } from "@/lib/api/permissions";

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/org/roles — list all CustomRoles for this tenant + QuikScale.
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikScaleAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "QuikScale app not registered" }, { status: 500 });
    }

    const roles = await db.appRole.findMany({
      where: { orgId, appId },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { permissions: true, navigations: true, members: true } },
      },
      // System roles first (admin pinned at top), then alphabetical.
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: roles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/org/roles — create a new AppRole.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId } = auth as { orgId: string; userId: string };

    const parsed = createRoleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { name, description, isDefault } = parsed.data;

    const appId = await getQuikScaleAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "QuikScale app not registered" }, { status: 500 });
    }

    const existing = await db.appRole.findUnique({
      where: { orgId_appId_name: { orgId, appId, name } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Role "${name}" already exists` },
        { status: 409 },
      );
    }

    // If creating a default role, demote any existing default for the same scope.
    if (isDefault) {
      await db.appRole.updateMany({
        where: { orgId, appId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const role = await db.appRole.create({
      data: {
        orgId,
        appId,
        name,
        description: description ?? null,
        isSystem: false,
        isDefault: isDefault ?? false,
        createdBy: userId,
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

    return NextResponse.json({ success: true, data: role }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
