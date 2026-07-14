import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureTenantRolesSeeded, provisionEmployee, mappedHrmsRole } from "@/lib/rbac/provisioning";
import { invalidatePermissionCache } from "@/lib/with-auth";
import { ensureSuperAdminRemains } from "@/lib/rbac/guards";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID } from "@/lib/rbac/registry";

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
 * Body: { orgId: string, adminUserIds?: string[], memberUserIds?: string[],
 *         roleAssignments?: { userId: string, roleName: string }[] }
 *   (all ids are central auth.User ids).
 *
 * `roleAssignments` is the forward role-sync path (admin portal "Edit Member"
 * role change): for each entry we resolve/JIT the Employee, SWAP its role to the
 * one named (falling back to the mapped admin/employee role for central-tier
 * names), and bust its permission cache — so the change shows in HRMS
 * People/Users immediately instead of at next login.
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
  let roleAssignments: { userId: string; roleName: string }[] = [];
  const ids = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  try {
    const body = (await req.json()) as {
      orgId?: unknown; adminUserIds?: unknown; memberUserIds?: unknown; roleAssignments?: unknown;
    };
    if (typeof body.orgId === "string" && body.orgId.trim()) orgIdRaw = body.orgId.trim();
    adminUserIds = ids(body.adminUserIds);
    memberUserIds = ids(body.memberUserIds);
    if (Array.isArray(body.roleAssignments)) {
      roleAssignments = body.roleAssignments
        .filter(
          (r): r is { userId: string; roleName: string } =>
            !!r && typeof (r as { userId?: unknown }).userId === "string" &&
            typeof (r as { roleName?: unknown }).roleName === "string",
        )
        .map((r) => ({ userId: r.userId.trim(), roleName: r.roleName.trim() }))
        .filter((r) => r.userId && r.roleName);
    }
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

  // Forward role sync: swap one user's HRMS role to `roleName`. Resolves (or
  // JIT-creates) the Employee, matches the role by name (else the mapped
  // admin/employee role), swaps and busts the cache. Returns a status string.
  async function setUserRole(userId: string, roleName: string): Promise<string> {
    let employee = await prisma.employee.findFirst({
      where: { orgId, authUserId: userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) {
      if (!(await provisionOne(userId, roleName))) return "no-central-user";
      employee = await prisma.employee.findFirst({
        where: { orgId, authUserId: userId, deletedAt: null },
        select: { id: true },
      });
      if (!employee) return "no-employee";
    }

    let role = await prisma.hrmsAppRole.findFirst({
      where: { orgId, appId: APP_ID, name: roleName },
      select: { id: true },
    });
    if (!role) {
      role = await prisma.hrmsAppRole.findFirst({
        where: { orgId, appId: APP_ID, name: mappedHrmsRole(roleName, false) },
        select: { id: true },
      });
    }
    if (!role) return "no-matching-role";

    try {
      await ensureSuperAdminRemains(orgId, [employee.id], role.id);
    } catch {
      return "super-admin-guard";
    }

    await prisma.$transaction(async (tx) => {
      await tx.hrmsUserAppRole.deleteMany({ where: { orgId, userId: employee!.id } });
      await tx.hrmsUserAppRole.create({
        data: { orgId, userId: employee!.id, roleId: role!.id, assignedBy: "central-sync" },
      });
    });
    invalidatePermissionCache(orgId, employee.id);
    await createAuditLog({
      orgId, userId: "central-sync", action: "Update", entityType: "EmployeeRole", entityId: employee.id,
      metadata: { roleId: role.id, roleName, source: "central" },
    });
    return "updated";
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

    // 3. Forward role-sync swaps (admin portal role change).
    const roleResults: { userId: string; status: string }[] = [];
    for (const { userId, roleName } of roleAssignments) {
      roleResults.push({ userId, status: await setUserRole(userId, roleName) });
    }

    return NextResponse.json({ success: true, data: { orgId, assignedUserIds: assigned, roleResults } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to provision roles";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
