/**
 * GET  /api/org/roles            → list all CnAppRole rows for this org's quikinfra app
 *                                  with member counts and isSystem/isDefault flags
 * POST /api/org/roles            → create a new role (initially zero permissions)
 *
 * Body for POST: { name: string, description?: string }
 *
 * Both endpoints require admin (legacy tier OR v2 system-admin role).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac/requireAdmin";
import { getQuikInfraAppId } from "@/lib/rbac/userCan";

export async function GET() {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    const appId = await getQuikInfraAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "App registry missing" }, { status: 500 });
    }

    const roles = await db.cnAppRole.findMany({
      where: { orgId, appId },
      orderBy: [{ isSystem: "desc" }, { isDefault: "desc" }, { name: "asc" }],
      include: { _count: { select: { members: true, rolePermissions: true } } },
    });

    const data = roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isDefault: r.isDefault,
      memberCount: r._count.members,
      permissionCount: r._count.rolePermissions,
      createdAt: r.createdAt.toISOString(),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId, userId } = ctxOrResponse;

    const appId = await getQuikInfraAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "App registry missing" }, { status: 500 });
    }

    const body = (await req.json()) as { name?: unknown; description?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : null;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Role name is required" },
        { status: 400 },
      );
    }

    const created = await db.cnAppRole.create({
      data: { orgId, appId, name, description, isSystem: false, isDefault: false, createdBy: userId },
      select: { id: true, name: true, description: true, isSystem: true, isDefault: true, createdAt: true },
    });

    return NextResponse.json(
      {
        success: true,
        data: { ...created, memberCount: 0, permissionCount: 0, createdAt: created.createdAt.toISOString() },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    if (error instanceof Error && /Unique constraint/.test(error.message)) {
      return NextResponse.json(
        { success: false, error: "A role with this name already exists" },
        { status: 409 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to create role";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
