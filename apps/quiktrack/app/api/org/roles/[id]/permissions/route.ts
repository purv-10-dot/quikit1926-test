import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import {
  isAction,
  isResource,
  isValidPermissionPair,
} from "@/lib/api/permissionsRegistry";
import { getQuikTrackAppId } from "@/lib/api/permissions";

// Accept any shape — we filter to catalog-valid pairs ourselves below so
// that a single stale (resource, action) row from an older registry can't
// fail the whole save with "Unknown resource".
const putBodySchema = z.object({
  permissions: z.array(
    z.object({ resource: z.string().min(1), action: z.string().min(1) }),
  ),
});

// GET /api/org/roles/[id]/permissions
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };
    const appId = await getQuikTrackAppId();

    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, ...(appId ? { appId } : {}) },
      select: {
        id: true,
        isSystem: true,
        permissions: { select: { resource: true, action: true } },
      },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { roleId: role.id, isSystem: role.isSystem, permissions: role.permissions },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/org/roles/[id]/permissions â€” atomic replace.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };
    const appId = await getQuikTrackAppId();

    const parsed = putBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const role = await db.qtAppRole.findFirst({
      where: { id: params.id, orgId, ...(appId ? { appId } : {}) },
      select: { id: true },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const seen = new Set<string>();
    const desired = parsed.data.permissions.filter((p) => {
      const k = `${p.resource}:${p.action}`;
      if (seen.has(k)) return false;
      if (!isResource(p.resource) || !isAction(p.action)) return false;
      if (!isValidPermissionPair(p.resource, p.action)) return false;
      seen.add(k);
      return true;
    });

    await db.$transaction([
      db.qtRolePermission.deleteMany({ where: { roleId: role.id } }),
      ...(desired.length > 0
        ? [
            db.qtRolePermission.createMany({
              data: desired.map((p) => ({
                roleId: role.id,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
