import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { isResource, isAction } from "@quikit/shared";

const grantSchema = z.object({
  resource: z.string().refine(isResource, "Unknown resource"),
  action: z.string().refine(isAction, "Unknown action"),
});

const putBodySchema = z.object({
  /** Full desired set. Server replaces the existing rows with this list. */
  permissions: z.array(grantSchema),
});

// GET /api/org/roles/[id]/permissions
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const role = await db.appRole.findFirst({
      where: { id: params.id, orgId },
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

// PUT /api/org/roles/[id]/permissions
// Replaces the entire (resource, action) set for this role atomically.
// Pass an empty array to revoke all permissions.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId } = auth as { orgId: string };

    const parsed = putBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const role = await db.appRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true, isSystem: true },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }
    if (role.isSystem) {
      return NextResponse.json(
        { success: false, error: "System role permissions cannot be modified (admin bypasses checks)" },
        { status: 400 },
      );
    }

    // Dedupe in case the client sends duplicates.
    const seen = new Set<string>();
    const desired = parsed.data.permissions.filter((p) => {
      const k = `${p.resource}:${p.action}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Atomic replace: deleteMany + createMany inside a transaction so a
    // half-applied PUT can never leave the role in a mixed state.
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId: role.id } }),
      ...(desired.length > 0
        ? [
            db.rolePermission.createMany({
              data: desired.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
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
