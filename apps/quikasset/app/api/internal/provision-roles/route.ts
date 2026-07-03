import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAppRoles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Eagerly seeds this org's default QuikAsset roles (system "admin" with full
 * permissions + the default "Member" role). Called by the launcher's
 * super-admin "create org" / "grant app access" flow the moment QuikAsset is
 * enabled for an org, so RBAC exists immediately instead of only after the
 * first authenticated request (or the manual scripts/seed-app.ts run).
 *
 * Optionally accepts `adminUserIds: string[]` — each is linked to the seeded
 * admin role via an app_quikasset.UserAppRole row, so a freshly-invited Org
 * Admin has the admin role the moment they accept the invite.
 *
 * Idempotent: the seeder is in-process cached + only fills grants when empty;
 * ensureUserOnRole skips existing rows.
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret` (mirrors verify-token).
 * Not a user session — no withOrgAuth.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }

  try {
    const { adminRoleId, memberRoleId } = await seedAllDefaultRoles(orgId);
    for (const userId of adminUserIds) {
      await ensureUserOnRole(userId, orgId, adminRoleId);
    }
    return NextResponse.json({
      success: true,
      adminRoleId,
      memberRoleId,
      assignedAdminUserIds: adminUserIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
