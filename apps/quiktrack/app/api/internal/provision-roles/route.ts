import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultRoles, ensureUserOnRole } from "@/lib/api/seedAdminAppRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Mirror of apps/quikscale/app/api/internal/provision-roles/route.ts for
 * QuikTrack's RBAC tables (app_quiktrack.AppRole / RolePermission /
 * UserAppRole, modelled in Prisma as QtAppRole / QtRolePermission /
 * QtUserAppRole).
 *
 * Seeds the default "admin" + "Member" roles for the org, then optionally
 * assigns the supplied `adminUserIds` to the admin role so the org admin
 * is wired up at the same moment access is granted.
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret`.
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
    const { adminRoleId, userRoleId } = await seedAllDefaultRoles(orgId);
    for (const userId of adminUserIds) {
      await ensureUserOnRole(userId, orgId, adminRoleId);
    }
    return NextResponse.json({
      success: true,
      adminRoleId,
      userRoleId,
      assignedAdminUserIds: adminUserIds,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
