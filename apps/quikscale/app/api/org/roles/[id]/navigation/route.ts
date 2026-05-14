import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { isNavKey } from "@/lib/api/permissionsRegistry";

const putBodySchema = z.object({
  /** Full desired set of navKeys. Server replaces existing rows. */
  navKeys: z.array(z.string().refine(isNavKey, "Unknown nav key")),
});

// GET /api/org/roles/[id]/navigation
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
        navigations: { select: { navKey: true } },
      },
    });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        roleId: role.id,
        isSystem: role.isSystem,
        navKeys: role.navigations.map((n) => n.navKey),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch navigation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/org/roles/[id]/navigation — replaces the entire navKey set.
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
    // v2: admin navigation is editable. `isSystem` only protects rename/delete.

    const desired = Array.from(new Set(parsed.data.navKeys));

    await db.$transaction([
      db.roleNavigation.deleteMany({ where: { roleId: role.id } }),
      ...(desired.length > 0
        ? [
            db.roleNavigation.createMany({
              data: desired.map((navKey) => ({ roleId: role.id, navKey })),
            }),
          ]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      data: { roleId: role.id, count: desired.length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save navigation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
