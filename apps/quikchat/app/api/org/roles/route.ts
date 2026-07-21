import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz/requireAdmin";
import { getQuikChatAppId } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

/**
 * QuikChat RBAC v2 admin routes (Phase 3). Gated by `requireAdmin` (platform
 * admin-tier OR the QuikChat system `admin` role via extraAdminCheck). These
 * intentionally use the QuikScale `{ success, data }` envelope so the ported
 * RolesTab/matrix read `json.success` / `json.data` unchanged — unlike
 * QuikChat's other routes, which use a bare `{ error }` body.
 */

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/org/roles — list all QcAppRoles for this tenant + QuikChat.
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;

  try {
    const appId = await getQuikChatAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "QuikChat app not registered" }, { status: 500 });
    }
    const roles = await db.qcAppRole.findMany({
      where: { orgId, appId },
      select: {
        id: true,
        name: true,
        description: true,
        isSystem: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { permissions: true, members: true } },
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ success: true, data: roles });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/org/roles — create a new (non-system) QcAppRole.
export async function POST(request: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId, userId } = gate;

  try {
    const parsed = createRoleSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { name, description, isDefault } = parsed.data;

    const appId = await getQuikChatAppId();
    if (!appId) {
      return NextResponse.json({ success: false, error: "QuikChat app not registered" }, { status: 500 });
    }

    const existing = await db.qcAppRole.findUnique({
      where: { orgId_appId_name: { orgId, appId, name } },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: `Role "${name}" already exists` }, { status: 409 });
    }

    if (isDefault) {
      await db.qcAppRole.updateMany({
        where: { orgId, appId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const role = await db.qcAppRole.create({
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
