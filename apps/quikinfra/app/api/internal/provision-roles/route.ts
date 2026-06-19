import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedDefaultRoles, ensureUserOnRole } from "@/lib/rbac/seedDefaultRoles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Eagerly seeds this org's default QuikInfra roles (the system "admin"
 * with full permissions + the default "user" role + "ho_user" + "site_admin").
 * Called by the launcher's super-admin "grant app access" flow the moment
 * QuikInfra is enabled for an org, so the admin panel's role dropdown shows
 * the 4 roles immediately instead of "No roles available" until someone
 * first opens QuikInfra.
 *
 * Optionally accepts `adminUserIds: string[]` — for each user id, an
 * `app_quikinfra.CnUserAppRole` row is upserted linking them to the seeded
 * "admin" AppRole. Used by the super-admin "create org with admin"
 * flow so the freshly-invited Org Admin has the admin role assigned the
 * moment they accept the invite — no lazy-seed gap.
 *
 * The lazy seed in GET /api/me/permissions (and the auto-assign in
 * src/lib/auth/context.ts) remains as the fallback — this endpoint just
 * removes the provisioning-order gap. Idempotent (the seeder is in-process
 * cached + only fills grants when empty; ensureUserOnRole skips on existing
 * rows).
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret` header (mirrors
 * apps/quikscale + apps/quiktrack provision-roles endpoints). Not a user
 * session — no withOrgAuth.
 *
 * Mirrors apps/quikscale/app/api/internal/provision-roles/route.ts.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  let orgId: string | null = null;
  let adminUserIds: string[] = [];
  try {
    const body = (await req.json()) as { orgId?: unknown; adminUserIds?: unknown };
    if (typeof body.orgId === "string" && body.orgId.trim()) {
      orgId = body.orgId.trim();
    }
    if (Array.isArray(body.adminUserIds)) {
      adminUserIds = body.adminUserIds.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      );
    }
  } catch {
    // fall through to 400
  }
  if (!orgId) {
    return NextResponse.json(
      { success: false, error: "orgId is required" },
      { status: 400 },
    );
  }

  try {
    const seeded = await seedDefaultRoles(orgId);
    if (!seeded) {
      return NextResponse.json(
        {
          success: false,
          error:
            "QuikInfra app not registered in quikit.App, or seeder couldn't resolve role IDs",
        },
        { status: 500 },
      );
    }

    // Assign every supplied user id to the admin (system) role.
    for (const userId of adminUserIds) {
      await ensureUserOnRole(userId, orgId, seeded.adminRoleId);
    }

    return NextResponse.json({
      success: true,
      adminRoleId: seeded.adminRoleId,
      hoUserRoleId: seeded.hoUserRoleId,
      siteAdminRoleId: seeded.siteAdminRoleId,
      userRoleId: seeded.userRoleId,
      assignedAdminUserIds: adminUserIds,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
