import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getQuikScaleAppId } from "@/lib/api/permissions";
import {
  isResource,
  isAction,
  isValidPermissionPair,
} from "@/lib/api/permissionsRegistry";

// RBAC v2: editing a user's permission extras still mutates the user record,
// so `User.view` reads and `User.update` writes. Role rows are unchanged.
const auth = withOrgAuthForResource("orgSetup.users", "User");

/**
 * Per-user additive permission grants — the "user extras" concept from
 * the Roles & Permissions v2 spec.
 *
 * Effective permission for a user = role grants UNION user extras.
 * Extras only ADD — they cannot subtract a role grant. To revoke role
 * access for one user, demote them to a less-privileged role instead.
 *
 * Endpoints:
 *   GET    → list the user's role grants + extras + effective merged set
 *   POST   → atomic replace of the extras set ({ extras: [...] })
 */

const pairSchema = z.object({
  resource: z.string().refine(isResource, "Unknown resource"),
  action: z.string().refine(isAction, "Unknown action"),
}).refine(
  (g) => isValidPermissionPair(g.resource, g.action),
  { message: "(resource, action) pair is not valid for this leaf" },
);

const postBodySchema = z.object({
  /** Full desired set of extras. Server replaces existing rows. */
  extras: z.array(pairSchema),
});

/* ─────────────────────── GET ─────────────────────── */

export const GET = auth.view<{ id: string }>(async ({ orgId }, _req, { params }) => {
  try {
    const appId = await getQuikScaleAppId();
    if (!appId) {
      return NextResponse.json(
        { success: false, error: "QuikScale app not registered" },
        { status: 500 },
      );
    }

    // Confirm target user exists for this org (any membership state).
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
      db.userAppRole.findMany({
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
      db.userPermissionExtra.findMany({
        where: { userId: params.id, orgId },
        select: { resource: true, action: true },
      }),
    ]);

    // Build the merged effective set with source attribution so the UI
    // can render "from role" vs "extra" tags on each checkbox.
    const roleGrants = new Set<string>();
    for (const ur of userRoles) {
      for (const p of ur.role.permissions) roleGrants.add(`${p.resource}:${p.action}`);
    }
    const extraSet = new Set(extras.map((e) => `${e.resource}:${e.action}`));

    type EffectiveEntry = {
      resource: string;
      action: string;
      source: "role" | "extra";
    };
    const effective: EffectiveEntry[] = [];
    // Role grants first (so the same key isn't double-listed)
    for (const key of roleGrants) {
      const [resource, action] = key.split(":");
      effective.push({ resource, action, source: "role" });
    }
    for (const key of extraSet) {
      if (roleGrants.has(key)) continue; // role grant takes precedence
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
        extras: extras,
        effective,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});

/* ─────────────────────── POST (atomic replace) ─────────────────────── */

export const POST = auth.update<{ id: string }>(async ({ orgId, userId: actorId }, req, { params }) => {
  try {
    const parsed = postBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
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

    // Dedupe in case the client sends duplicates.
    const seen = new Set<string>();
    const desired = parsed.data.extras.filter((p) => {
      const k = `${p.resource}:${p.action}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Atomic replace: deleteMany + createMany inside a transaction.
    await db.$transaction([
      db.userPermissionExtra.deleteMany({
        where: { userId: params.id, orgId },
      }),
      ...(desired.length > 0
        ? [
            db.userPermissionExtra.createMany({
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
    const message =
      error instanceof Error ? error.message : "Failed to save user permissions";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
