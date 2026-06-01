/**
 * GET /api/org/roles/[id]/permissions   → current matrix state for one role
 * PUT /api/org/roles/[id]/permissions   → replace matrix atomically
 *
 * PUT body: { permissions: Array<{ resource: string, action: string }> }
 *
 * Every pair is validated against permissionsRegistry. Invalid pairs are
 * rejected with 400 — the server is the source of truth for what's grantable.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@quikit/database";
import { requireAdmin } from "@/lib/rbac/requireAdmin";
import { isValidPermissionPair } from "@/lib/rbac/permissionsRegistry";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    const role = await db.cnAppRole.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const rows = await db.cnRolePermissionV2.findMany({
      where: { roleId: params.id },
      select: { resource: true, action: true },
    });

    return NextResponse.json({ success: true, data: { permissions: rows } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctxOrResponse = await requireAdmin();
    if ("error" in ctxOrResponse) return ctxOrResponse.error;
    const { orgId } = ctxOrResponse;

    const role = await db.cnAppRole.findFirst({ where: { id: params.id, orgId }, select: { id: true } });
    if (!role) {
      return NextResponse.json({ success: false, error: "Role not found" }, { status: 404 });
    }

    const body = (await req.json()) as { permissions?: unknown };
    if (!Array.isArray(body.permissions)) {
      return NextResponse.json(
        { success: false, error: "permissions[] is required" },
        { status: 400 },
      );
    }

    const pairs: Array<{ resource: string; action: string }> = [];
    for (const p of body.permissions) {
      if (!p || typeof p !== "object") {
        return NextResponse.json({ success: false, error: "Malformed permission entry" }, { status: 400 });
      }
      const obj = p as { resource?: unknown; action?: unknown };
      if (typeof obj.resource !== "string" || typeof obj.action !== "string") {
        return NextResponse.json({ success: false, error: "resource/action must be strings" }, { status: 400 });
      }
      if (!isValidPermissionPair(obj.resource, obj.action)) {
        return NextResponse.json(
          { success: false, error: `Unknown permission: ${obj.resource}:${obj.action}` },
          { status: 400 },
        );
      }
      pairs.push({ resource: obj.resource, action: obj.action });
    }

    // Replace atomically: delete all, recreate.
    await db.$transaction([
      db.cnRolePermissionV2.deleteMany({ where: { roleId: params.id } }),
      db.cnRolePermissionV2.createMany({
        data: pairs.map((p) => ({ roleId: params.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      }),
    ]);

    return NextResponse.json({ success: true, data: { permissions: pairs } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
