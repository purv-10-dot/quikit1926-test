import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/authz/requireAdmin";
import { isResource, isAction, isValidPermissionPair } from "@/lib/authz/permissionsRegistry";

export const dynamic = "force-dynamic";

const grantSchema = z
  .object({
    resource: z.string().refine(isResource, "Unknown resource"),
    action: z.string().refine(isAction, "Unknown action"),
  })
  .refine((g) => isValidPermissionPair(g.resource, g.action), {
    message: "(resource, action) pair is not valid for this leaf",
  });

const putBodySchema = z.object({
  permissions: z.array(grantSchema),
});

type Params = { params: { id: string } };

// GET /api/org/roles/[id]/permissions
export async function GET(_req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;
  try {
    const role = await db.qcAppRole.findFirst({
      where: { id: params.id, orgId },
      select: {
        id: true,
        isSystem: true,
        permissions: { select: { resource: true, action: true } },
      },
    });
    if (!role) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    return NextResponse.json({
      success: true,
      data: { roleId: role.id, isSystem: role.isSystem, permissions: role.permissions },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT /api/org/roles/[id]/permissions — atomic replace of the whole grant set.
// Pass an empty array to revoke all. v2: admin grants are editable (isSystem
// only protects rename/delete, enforced in [id]/route.ts).
export async function PUT(req: NextRequest, { params }: Params) {
  const gate = await requireAdmin();
  if ("error" in gate) return gate.error;
  const { orgId } = gate;
  try {
    const parsed = putBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const role = await db.qcAppRole.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!role) return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });

    // Dedupe in case the client sends duplicates.
    const seen = new Set<string>();
    const desired = parsed.data.permissions.filter((p) => {
      const k = `${p.resource}:${p.action}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Atomic replace: deleteMany + createMany as one transaction so a
    // half-applied PUT can't leave a mixed state. (QuikChat has no withTxRetry;
    // plain $transaction — the replace is idempotent if retried.)
    await db.$transaction([
      db.qcRolePermission.deleteMany({ where: { roleId: role.id } }),
      ...(desired.length > 0
        ? [
            db.qcRolePermission.createMany({
              data: desired.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
            }),
          ]
        : []),
    ]);

    return NextResponse.json({ success: true, data: { roleId: role.id, count: desired.length } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
