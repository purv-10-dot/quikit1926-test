import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikScaleAppId } from "@/lib/api/permissions";

// RBAC v2: gated by the existing `User` resource. Listing/creating roles is
// part of user administration, so it shares the User CRUD grants — no
// separate Role resource is exposed in the matrix. Admin role bypass still
// applies inside `userCan()`.
const auth = withOrgAuthForResource("orgSetup.users", "User");

const createRoleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64),
  description: z.string().trim().max(500).optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/org/roles — list all AppRoles for this tenant + QuikScale.
export const GET = auth.view(async ({ orgId }) => {
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
      _count: { select: { permissions: true, members: true } },
    },
    // System roles first (admin pinned at top), then alphabetical.
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({ success: true, data: roles });
}, { fallbackErrorMessage: "Failed to list roles" });

// POST /api/org/roles — create a new AppRole.
export const POST = auth.create(async ({ orgId, userId }, request) => {
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
}, { fallbackErrorMessage: "Failed to create role" });
