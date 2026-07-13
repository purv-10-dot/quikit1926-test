import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikAssetAppId } from "@/lib/api/permissions";

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/org/roles — list every AstAppRole for (orgId, quikasset appId).
export async function GET() {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const appId = await getQuikAssetAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikAsset app not registered" },
        { status: 500 },
      );
    }

    const roles = await db.astAppRole.findMany({
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
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: roles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/org/roles — create a new AstAppRole.
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

    const appId = await getQuikAssetAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikAsset app not registered" },
        { status: 500 },
      );
    }

    const existing = await db.astAppRole.findUnique({
      where: { orgId_appId_name: { orgId, appId, name } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Role "${name}" already exists` },
        { status: 409 },
      );
    }

    if (isDefault) {
      await db.astAppRole.updateMany({
        where: { orgId, appId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const role = await db.astAppRole.create({
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
