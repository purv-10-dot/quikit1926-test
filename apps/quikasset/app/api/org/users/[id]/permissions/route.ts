import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { getQuikAssetAppId } from "@/lib/api/permissions";
import { isAction, isResource, isValidPermissionPair } from "@/lib/api/permissionsRegistry";

/**
 * Per-user additive grants (`AstUserPermissionExtra`). Effective permissions =
 * role grants UNION extras. Extras can only ADD — to revoke role grants for a
 * single user, change their role.
 */

// Accept any {resource, action} strings; invalid/stale pairs are filtered in
// the handler rather than rejecting the whole save.
const pairSchema = z.object({ resource: z.string(), action: z.string() });
const putBodySchema = z.object({ extras: z.array(pairSchema) });

// GET — list role grants + extras + effective merged set.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { userId: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "User not found in this organization" },
        { status: 404 },
      );
    }

    const [userRoles, extras] = await Promise.all([
      db.astUserAppRole.findMany({
        where: { userId: params.id, orgId, role: { appId } },
        select: {
          role: {
            select: {
              id: true,
              name: true,
              permissions: { select: { resource: true, action: true } },
            },
          },
        },
      }),
      db.astUserPermissionExtra.findMany({
        where: { userId: params.id, orgId },
        select: { resource: true, action: true },
      }),
    ]);

    const roleGrants = new Set<string>();
    for (const ur of userRoles) {
      for (const p of ur.role.permissions) roleGrants.add(`${p.resource}:${p.action}`);
    }
    const extraSet = new Set(extras.map((e) => `${e.resource}:${e.action}`));

    type EffectiveEntry = { resource: string; action: string; source: "role" | "extra" };
    const effective: EffectiveEntry[] = [];
    for (const key of roleGrants) {
      const [resource, action] = key.split(":");
      effective.push({ resource, action, source: "role" });
    }
    for (const key of extraSet) {
      if (roleGrants.has(key)) continue;
      const [resource, action] = key.split(":");
      effective.push({ resource, action, source: "extra" });
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: params.id,
        roles: userRoles.map((ur) => ({ id: ur.role.id, name: ur.role.name })),
        roleGrants: Array.from(roleGrants).map((k) => {
          const [resource, action] = k.split(":");
          return { resource, action };
        }),
        extras,
        effective,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// PUT — atomic replace of the user's extras set.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { orgId, userId: actorId } = auth as { orgId: string; userId: string };

    const parsed = putBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const member = await db.orgMember.findUnique({
      where: { orgId_userId: { orgId, userId: params.id } },
      select: { userId: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "User not found in this organization" },
        { status: 404 },
      );
    }

    const seen = new Set<string>();
    const desired = parsed.data.extras.filter((p) => {
      const k = `${p.resource}:${p.action}`;
      if (seen.has(k)) return false;
      // Drop unknown / stale pairs instead of failing the whole save.
      if (!isResource(p.resource) || !isAction(p.action)) return false;
      if (!isValidPermissionPair(p.resource, p.action)) return false;
      seen.add(k);
      return true;
    });

    await db.$transaction([
      db.astUserPermissionExtra.deleteMany({ where: { userId: params.id, orgId } }),
      ...(desired.length > 0
        ? [
            db.astUserPermissionExtra.createMany({
              data: desired.map((p) => ({
                userId: params.id,
                orgId,
                resource: p.resource,
                action: p.action,
                grantedBy: actorId,
              })),
            }),
          ]
        : []),
    ]);

    return NextResponse.json({
      success: true,
      data: { userId: params.id, count: desired.length },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save user permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
