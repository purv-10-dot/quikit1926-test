import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultRoles, ensureUserRole } from "@/lib/authz/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles — service-to-service only.
 *
 * Eagerly seeds this org's default QuikChat roles (system "admin" with full
 * permissions + "Moderator" / default "Member" / "Guest"). Called by the
 * launcher's super-admin "grant app access" flow the moment QuikChat is
 * enabled for an org, so the admin panel's role dropdown shows roles
 * immediately instead of waiting for someone to first open QuikChat.
 *
 * Optionally accepts `adminUserIds: string[]` — each is bound to its QuikChat
 * role now (via `ensureUserRole`, which classifies org_admin/super_admin →
 * `admin`, everyone else → `Member`, exactly like the first-request seed path),
 * so a freshly-invited Org Admin has the role assigned the moment they accept —
 * no lazy-seed gap.
 *
 * The lazy seed in `ensureUserRole` (via withOrgAuth) / GET /api/me/permissions
 * remains the fallback — this endpoint just removes the provisioning-order gap.
 * Idempotent (seeder is process-cached + only fills grants when empty;
 * `ensureUserRole` no-ops when the user already holds a role).
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret` (mirrors the other apps'
 * provision-roles + verify-token-remote). Not a user session — no withOrgAuth.
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
    const seeded = await seedAllDefaultRoles(orgId);
    if (!seeded) {
      return NextResponse.json(
        { success: false, error: "QuikChat app is not registered" },
        { status: 500 },
      );
    }
    // Bind each provided user to their QuikChat role now (idempotent).
    for (const userId of adminUserIds) {
      await ensureUserRole(userId, orgId);
    }
    return NextResponse.json({
      success: true,
      adminRoleId: seeded.adminRoleId,
      memberRoleId: seeded.memberRoleId,
      provisionedUserIds: adminUserIds,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
