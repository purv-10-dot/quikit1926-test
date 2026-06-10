import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultCrmRoles } from "@/lib/api/seed-crm-app-roles";
import { ensureUserOnCrmRole } from "@/lib/api/crm-rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Eagerly seeds this org's default QuikCRM roles (system "admin" with full
 * permissions + the default "sales-user" role + the other curated roles) into
 * app_quikcrm, and — when `adminUserIds` is provided — assigns each of those
 * users to the seeded admin AppRole (app_quikcrm.UserAppRole).
 *
 * Called by the launcher's super-admin flows the moment QuikCRM is granted to
 * an org:
 *   • POST /api/super/orgs              — create-org-with-admin
 *   • POST /api/super/org-app-access/:  — later grant/revoke toggles
 * (dispatched via apps/quikit/lib/provisionAppRoles.ts). This mirrors the
 * QuikScale / QuikTrack / QuikInfra provision-roles endpoints so the org admin
 * has the admin role the moment QuikCRM is enabled — no lazy-seed gap.
 *
 * Idempotent: `seedAllDefaultCrmRoles` is in-process cached and only fills
 * grants when empty; `ensureUserOnCrmRole` skips when the row already exists.
 *
 * Auth: shared INTERNAL_SECRET via the `x-internal-secret` header — not a user
 * session (no withTenantAuth). Mirrors the other apps' internal endpoints.
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
    const { adminRoleId, defaultRoleId } = await seedAllDefaultCrmRoles(orgId);
    for (const userId of adminUserIds) {
      await ensureUserOnCrmRole(userId, orgId, adminRoleId);
    }
    return NextResponse.json({
      success: true,
      adminRoleId,
      defaultRoleId,
      assignedAdminUserIds: adminUserIds,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
