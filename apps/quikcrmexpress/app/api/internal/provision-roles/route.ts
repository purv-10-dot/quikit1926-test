import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultCrmRoles } from "@/lib/api/seed-crm-app-roles";
import { ensureUserOnCrmRole } from "@/lib/api/crm-rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Eagerly seeds this org's default CrmExpress roles (system "admin" with full
 * permissions + the default "sales-user" role + sales-manager / marketing-user
 * / finance-user) into app_quikcrmexpress, and — when `adminUserIds` is
 * provided — assigns each of those users to the seeded admin AppRole
 * (app_quikcrmexpress.UserAppRole).
 *
 * Called by the launcher's flows the moment CrmExpress is granted to an org:
 *   • POST /api/super/orgs              — create-org-with-admin
 *   • POST /api/super/org-app-access/:  — later grant/revoke toggles
 *   • POST /api/org/apps/activate       — self-serve trial activation
 * (dispatched via apps/quikit/lib/provisionAppRoles.ts, which already maps
 * `quikcrmexpress: "QUIKCRMEXPRESS_URL"`).
 *
 * Why this route exists: the 20260807180000_quikcrmexpress_init migration
 * CREATEs app_quikcrmexpress."AppRole" but seeds no rows, and this app has no
 * lazy seed on first authenticated load — `seedAllDefaultCrmRoles` was only
 * ever reached from Settings → Users (users.service.ts). So on any environment
 * where nobody had opened that screen, the Admin Portal's per-app role
 * dropdown (`GET /api/roles?appSlug=quikcrmexpress`) read an empty table and
 * rendered "No roles available". Every other app in the monorepo already
 * exposes this endpoint; CrmExpress was the only gap.
 *
 * Idempotent: `seedAllDefaultCrmRoles` is in-process cached and only fills
 * grants when empty; `ensureUserOnCrmRole` skips when the row already exists.
 *
 * Auth: shared INTERNAL_SECRET via the `x-internal-secret` header — not a user
 * session (no requireApiUser). Mirrors the other apps' internal endpoints.
 * `/api/*` is excluded from this app's middleware matcher, so no auth bounce.
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
