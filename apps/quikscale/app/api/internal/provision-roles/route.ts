import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAllDefaultRoles } from "@/lib/api/seedAdminAppRole";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Eagerly seeds this org's default QuikScale roles (system "admin" with
 * full permissions + the default "Member" role). Called by the launcher's
 * super-admin "grant app access" flow the moment QuikScale is enabled for
 * an org, so the admin panel's role dropdown shows "admin" immediately
 * instead of "No roles available" until someone first opens QuikScale.
 *
 * The lazy seed in GET /api/me/permissions remains as the fallback — this
 * endpoint just removes the provisioning-order gap. Idempotent (the
 * seeder is in-process cached + only fills grants when empty).
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret` (mirrors
 * verify-token-remote). Not a user session — no withOrgAuth.
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
  try {
    const body = (await req.json()) as { orgId?: unknown };
    if (typeof body.orgId === "string" && body.orgId.trim()) {
      orgId = body.orgId.trim();
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
    return NextResponse.json({ success: true, adminRoleId, userRoleId });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
