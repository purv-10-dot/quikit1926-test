import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTenantRolesSeeded, provisionEmployee } from "@/lib/rbac/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/provision-roles  — service-to-service only.
 *
 * Called by the QuikIT launcher's super-admin "grant app access" /
 * "create-org-with-admin" flows (apps/quikit/lib/provisionAppRoles.ts) the
 * moment QuikHRMS is enabled for an org. Mirrors the quikscale/quiktrack
 * endpoints so HRMS roles + the invited Org Admin's UserAppRole exist
 * immediately, instead of lazily on the invitee's first SSO login.
 *
 * Body: { orgId: string, adminUserIds?: string[] }  (central auth.User ids).
 *
 * HRMS wrinkle: UserAppRole.userId → Employee.id (not the central user id).
 * So for each admin id we (a) resolve the central user's email/name from
 * auth."User" (same physical DB, raw read), then (b) JIT-create the Employee
 * + UserAppRole via the shared provisionEmployee() — Active status, because a
 * PreBoarding admin would be narrowed out of their own admin permissions.
 *
 * Auth: shared INTERNAL_SECRET via x-internal-secret (mirrors
 * verify-token-remote). Not a user session. Idempotent (ensure + upsert).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  let orgIdRaw: string | null = null;
  let adminUserIds: string[] = [];
  let memberUserIds: string[] = [];
  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  try {
    const body = (await req.json()) as { orgId?: unknown; adminUserIds?: unknown; memberUserIds?: unknown };
    if (typeof body.orgId === "string" && body.orgId.trim()) orgIdRaw = body.orgId.trim();
    adminUserIds = ids(body.adminUserIds);
    memberUserIds = ids(body.memberUserIds);
  } catch {
    // fall through to 400
  }
  if (!orgIdRaw) {
    return NextResponse.json({ success: false, error: "orgId is required" }, { status: 400 });
  }
  const orgId = orgIdRaw;

  // Resolve the central user, then create Employee + UserAppRole with the given
  // membership role. Returns false when the central user can't be resolved.
  async function provisionOne(userId: string, membershipRole: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<
      Array<{ email: string; firstName: string | null; lastName: string | null; isSuperAdmin: boolean }>
    >`SELECT email, "firstName", "lastName", "isSuperAdmin"
        FROM auth."User" WHERE id = ${userId} LIMIT 1`;
    const u = rows[0];
    if (!u?.email) return false; // unknown central user — skip, JIT will cover on login
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || null;
    await provisionEmployee({
      orgId,
      authUserId: userId,
      email: u.email,
      name,
      membershipRole,
      isSuperAdmin: Boolean(u.isSuperAdmin),
    });
    return true;
  }

  try {
    // 1. Seed the tenant's HRMS AppRoles even when no users are supplied, so
    //    the role dropdown is populated the moment access is granted.
    await ensureTenantRolesSeeded(orgId, null);

    // 2. Eagerly create Employee + UserAppRole. Admins → admin, members → employee.
    const assigned: string[] = [];
    for (const userId of adminUserIds) {
      if (await provisionOne(userId, "org_admin")) assigned.push(userId);
    }
    for (const userId of memberUserIds) {
      if (adminUserIds.includes(userId)) continue; // admin wins if listed in both
      if (await provisionOne(userId, "member")) assigned.push(userId);
    }

    return NextResponse.json({ success: true, data: { orgId, assignedUserIds: assigned } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
