import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { isResource, isAction, isValidPermissionPair } from "@/lib/api/permissionsRegistry";

// RBAC v2: gated by the `Role` resource. `isSystem` still protects
// rename/delete (enforced in [id]/route.ts) — admin permissions themselves
// are editable like any other role's.
const auth = withOrgAuthForResource("Role");

const grantSchema = z
  .object({
    resource: z.string().refine(isResource, "Unknown resource"),
    action: z.string().refine(isAction, "Unknown action"),
  })
  .refine((g) => isValidPermissionPair(g.resource, g.action), {
    message: "(resource, action) pair is not valid for this leaf",
  });

const putBodySchema = z.object({
  /** Full desired set. Server replaces the existing rows with this list. */
  permissions: z.array(grantSchema),
});

// GET /api/org/roles/[id]/permissions
export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const role = await db.wfAppRole.findFirst({
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
}, { fallbackErrorMessage: "Failed to fetch permissions" });

// PUT /api/org/roles/[id]/permissions
// Replaces the entire (resource, action) set for this role atomically.
// Pass an empty array to revoke all permissions.
export const PUT = auth.update<{ id: string }>(async ({ orgId }, req, { params }) => {
  const parsed = putBodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const role = await db.wfAppRole.findFirst({
    where: { id: params.id, orgId },
    select: { id: true, isSystem: true },
  });
  if (!role) {
    return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
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
    db.wfRolePermission.deleteMany({ where: { roleId: role.id } }),
    ...(desired.length > 0
      ? [
          db.wfRolePermission.createMany({
            data: desired.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    success: true,
    data: { roleId: role.id, count: desired.length },
  });
}, { fallbackErrorMessage: "Failed to save permissions" });
