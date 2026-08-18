import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { seedAppRoles, ensureUserOnRole } from "@/lib/seedAppRoles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles — service-to-service only.
 *
 * Eagerly seeds this org's QuikInsight AppRole rows so the Admin Portal's role
 * dropdown shows them immediately instead of "No roles available", and so the
 * central `assignAppRoles()` flow can resolve a role by name. Mirrors the
 * endpoint of the same path in quikscale / quiklms / quiksocial; called by the
 * launcher's grant-app-access flow (apps/quikit/lib/provisionAppRoles.ts) the
 * moment QuikInsight is enabled for an org.
 *
 * Optionally accepts `adminUserIds: string[]` — each is put on `admin`, the
 * only QuikInsight role that can manage org-wide roles (see lib/rbac.ts), so a
 * freshly-invited org admin can administer the app the moment they accept.
 *
 * Auth: shared INTERNAL_SECRET via `x-internal-secret`. Not a user session.
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
    if (typeof body.orgId === "string" && body.orgId.trim()) orgId = body.orgId.trim();
    if (Array.isArray(body.adminUserIds)) {
      adminUserIds = body.adminUserIds.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0,
      );
    }
  } catch {
    // fall through to the 400 below
  }
  if (!orgId) {
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }

  try {
    const roles = await seedAppRoles(orgId);

    // Per-user, not one shared try: one unassignable id must not discard the
    // role seeding that already succeeded — the catalogue is the reason the
    // launcher calls this endpoint at all.
    const skipped: string[] = [];
    for (const userId of adminUserIds) {
      try {
        await ensureUserOnRole(userId, orgId, "admin");
      } catch (err) {
        skipped.push(userId);
        // eslint-disable-next-line no-console
        console.warn(
          `[provision-roles] could not assign admin to ${userId} in ${orgId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: { roles: roles.size, assigned: adminUserIds.length - skipped.length, skipped },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Role provisioning failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
