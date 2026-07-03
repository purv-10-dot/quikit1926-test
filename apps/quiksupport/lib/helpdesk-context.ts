/**
 * helpdesk-context.ts — identity bridge between the QuikIT session and the
 * helpdesk's own tenant/user/RBAC tables.
 *
 * In standalone form the helpdesk read identity from x-tenant-id / x-user-id
 * headers. Integrated into QuikIT it instead reads the NextAuth session
 * (the common auth layer) and maps it onto the helpdesk's internal records:
 *
 *   QuikIT orgId   → HdTenant.id          (the helpdesk "tenant")
 *   QuikIT user.id → HdUser.external_id   (the helpdesk "user")
 *   membershipRole → HdUser.role          (only on first provision)
 *
 * On first access for an org/user we auto-provision (the helpdesk's
 * "integrated" mode): system permission catalogue + system roles, the
 * HdTenant, a default HdApp, and the HdUser. The in-app Users/Roles views
 * remain the source of truth for fine-grained role changes afterwards (the
 * second permission layer, managed inside the app — exactly like quiktrack).
 */
import { getServerSession } from "next-auth/next";
import type { Session } from "next-auth";
import { authOptions } from "./auth";
import { prisma, db } from "./db";
import { AuthError } from "./errors";
import { ALL_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "./rbac";
import { seedAllDefaultRoles, ensureUserOnRole, getQuikSupportAppId } from "./api/seedAppRole";
import type { HdUser, HdUserRole } from "@prisma/client";

export { AuthError };

export interface AuthContext {
  tenantId: string;
  appId: string;
  userId: string;
  user: HdUser;
}

const ADMIN_MEMBERSHIP_ROLES = ["org_admin", "super_admin", "admin"];

/** Map a QuikIT membership role onto a helpdesk role (used only at first provision). */
function mapMembershipRole(
  membershipRole?: string | null,
  isSuperAdmin?: boolean,
): HdUserRole {
  if (isSuperAdmin) return "HELPDESK_ADMIN";
  if (membershipRole && ADMIN_MEMBERSHIP_ROLES.includes(membershipRole)) {
    return "HELPDESK_ADMIN";
  }
  return "CUSTOMER";
}

/**
 * Is this user a QuikSupport admin at the PLATFORM layer? This is the SAME set
 * of signals the admin portal / launcher use to grant admin access, so the
 * helpdesk experience reflects the role the org actually granted — not merely
 * the central org-membership tier. True when the user is:
 *   - a platform super-admin, OR
 *   - an org-tier admin (OrgMember.role ∈ super_admin/org_admin/admin), OR
 *   - granted QuikSupport with the "admin" app role (UserAppAccess.role), OR
 *   - holds the QuikSupport "admin" AppRole (Qsp system role — what the admin
 *     portal's "Role in QuikSupport" dropdown assigns).
 *
 * Reads the central quikit tables via `db`; the Hd* domain user is derived from
 * this (see ensureHelpdeskUser).
 */
async function isPlatformHelpdeskAdmin(
  tenantId: string,
  externalUserId: string,
  session: Session,
): Promise<boolean> {
  if (session.user.isSuperAdmin === true) return true;
  if (ADMIN_MEMBERSHIP_ROLES.includes(session.user.membershipRole ?? "")) return true;

  const appId = await getQuikSupportAppId();
  if (!appId) return false;

  const [access, appAdminRole] = await Promise.all([
    db.userAppAccess.findFirst({
      where: { userId: externalUserId, orgId: tenantId, appId, role: "admin" },
      select: { id: true },
    }),
    db.qspUserAppRole.findFirst({
      where: { userId: externalUserId, orgId: tenantId, role: { appId, isSystem: true, name: "admin" } },
      select: { id: true },
    }),
  ]);
  return !!access || !!appAdminRole;
}

/** Reads the QuikIT session, or throws 401/403. */
async function requireSession(): Promise<Session & { user: { id: string; orgId: string } }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new AuthError("Not authenticated", 401);
  if (!session.user.orgId) throw new AuthError("No organization selected for this session", 403);
  return session as Session & { user: { id: string; orgId: string } };
}

// ─── Provisioning ──────────────────────────────────────────────────────────

let systemDataReady: Promise<void> | null = null;

/** Idempotently seed the global permission catalogue + system roles. Runs once per process. */
async function ensureSystemData(): Promise<void> {
  if (systemDataReady) return systemDataReady;
  systemDataReady = (async () => {
    // Permission catalogue (global, keyed by `key`).
    for (const p of ALL_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { key: p.key },
        update: { name: p.name, description: p.description, resource: p.resource, action: p.action },
        create: { key: p.key, name: p.name, description: p.description, resource: p.resource, action: p.action },
      });
    }
    // System roles (tenant_id = null) + their permissions.
    for (const [roleName, permKeys] of Object.entries(SYSTEM_ROLE_PERMISSIONS)) {
      let role = await prisma.role.findFirst({ where: { name: roleName, is_system: true, tenant_id: null } });
      if (!role) {
        role = await prisma.role.create({
          data: { name: roleName, is_system: true, tenant_id: null, description: `${roleName} (system role)` },
        });
      }
      for (const key of permKeys) {
        const perm = await prisma.permission.findUnique({ where: { key } });
        if (!perm) continue;
        await prisma.rolePermission.upsert({
          where: { role_id_permission_id: { role_id: role.id, permission_id: perm.id } },
          update: {},
          create: { role_id: role.id, permission_id: perm.id },
        });
      }
    }
  })().catch((err) => {
    // Best-effort: never block the request if seeding races/fails.
    systemDataReady = null;
    console.error("[quiksupport] ensureSystemData failed", err);
  });
  return systemDataReady;
}

/**
 * Ensure the HdTenant, a default HdApp and the HdUser exist for this session.
 * Returns the HdUser. Idempotent — safe to call on every request.
 */
export async function ensureHelpdeskUser(
  tenantId: string,
  externalUserId: string,
  session: Session,
): Promise<HdUser> {
  await ensureSystemData();

  const name =
    session.user.name ||
    [session.user.firstName, session.user.lastName].filter(Boolean).join(" ") ||
    session.user.email ||
    "User";
  const email = session.user.email || `${externalUserId}@quikit.local`;

  // Tenant (HdTenant.id == QuikIT orgId).
  await prisma.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, name: "Organization", code: tenantId },
  });

  // Default app so tickets can be filed out-of-the-box.
  const appCount = await prisma.app.count({ where: { tenant_id: tenantId } });
  if (appCount === 0) {
    await prisma.app.create({
      data: {
        tenant_id: tenantId,
        name: "General Support",
        code: "general",
        icon: "🎫",
        color: "#6366F1",
        accent: "#EEF2FF",
      },
    });
  }

  // Helpdesk role is derived from the QuikSupport platform grant, not just the
  // central membership tier — so a member granted QuikSupport "admin" via the
  // admin portal lands on the full admin helpdesk (dashboard/queue/categories/
  // …) instead of the bare customer "My Tickets" view.
  //
  // Upgrade-only sync: a platform admin is always (re)set to HELPDESK_ADMIN on
  // login so the grant takes effect even if the row was provisioned as CUSTOMER
  // before the grant. Non-admins keep whatever the in-app Users & Roles view
  // assigned (CUSTOMER default, or AGENT / CATEGORY_LEAD) — we never downgrade.
  const platformAdmin = await isPlatformHelpdeskAdmin(tenantId, externalUserId, session);
  const user = await prisma.user.upsert({
    where: { tenant_id_external_id: { tenant_id: tenantId, external_id: externalUserId } },
    update: { name, email, ...(platformAdmin ? { role: "HELPDESK_ADMIN" as HdUserRole } : {}) },
    create: {
      tenant_id: tenantId,
      external_id: externalUserId,
      name,
      email,
      role: platformAdmin
        ? "HELPDESK_ADMIN"
        : mapMembershipRole(session.user.membershipRole, session.user.isSuperAdmin),
      color: "#6366F1",
    },
  });

  // Also seed + assign the standard QuikIT RBAC layer (the one the admin portal
  // manages via /api/roles?appSlug=quiksupport). Best-effort — never block the
  // request on it. The helpdesk's own Hd* role on `user` remains the in-app gate.
  try {
    const { adminRoleId, userRoleId } = await seedAllDefaultRoles(tenantId);
    const isAdminRole = user.role === "HELPDESK_ADMIN";
    await ensureUserOnRole(externalUserId, tenantId, isAdminRole ? adminRoleId : userRoleId);
  } catch (err) {
    console.error("[quiksupport] standard RBAC provisioning skipped", err);
  }

  return user;
}

/**
 * Resolve the HdApp that tickets attach to for this tenant. The integrated
 * app provisions a single "General Support" app per tenant (see
 * `ensureHelpdeskUser`). The QuikIT session carries no helpdesk-app concept,
 * so `getAuthFromRequest` returns an empty `appId` — callers that need a real
 * `app_id` (ticket creation) must resolve it here instead. Creates the default
 * app if it is somehow missing (e.g. a user provisioned before the
 * default-app code existed), so ticket creation never hits a FK violation.
 */
export async function resolveDefaultAppId(tenantId: string): Promise<string> {
  const existing = await prisma.app.findFirst({
    where: { tenant_id: tenantId, is_active: true },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  const app = await prisma.app.upsert({
    where: { tenant_id_code: { tenant_id: tenantId, code: "general" } },
    update: {},
    create: {
      tenant_id: tenantId,
      name: "General Support",
      code: "general",
      icon: "🎫",
      color: "#6366F1",
      accent: "#EEF2FF",
    },
  });
  return app.id;
}

// ─── Context accessors (used by route handlers + the dashboard page) ─────────

/**
 * Session-backed replacement for the old header reader. The `req` arg is kept
 * for call-site compatibility but ignored — identity comes from the session.
 */
export async function getAuthFromRequest(_req?: Request): Promise<{
  tenantId: string;
  appId: string;
  externalUserId: string;
}> {
  const session = await requireSession();
  return { tenantId: session.user.orgId, appId: "", externalUserId: session.user.id };
}

export async function getAuthContext(): Promise<AuthContext> {
  const session = await requireSession();
  const user = await resolveUser(session.user.orgId, session.user.id);
  return { tenantId: session.user.orgId, appId: "", userId: user.id, user };
}

/**
 * Resolve (and auto-provision) the helpdesk user for a tenant. Provisioning
 * pulls profile/role data from the live session when the user is new.
 */
export async function resolveUser(tenantId: string, externalUserId: string): Promise<HdUser> {
  let user = await prisma.user.findUnique({
    where: { tenant_id_external_id: { tenant_id: tenantId, external_id: externalUserId } },
  });

  if (!user) {
    const session = await getServerSession(authOptions);
    if (session?.user?.id === externalUserId && session.user.orgId === tenantId) {
      user = await ensureHelpdeskUser(tenantId, externalUserId, session);
    }
  }

  if (!user) throw new AuthError("User not found in this tenant", 403);
  if (!user.is_active) throw new AuthError("User account is deactivated", 403);
  return user;
}

// ─── Role helpers (unchanged behaviour) ──────────────────────────────────────

export function requireRole(user: HdUser, ...roles: HdUserRole[]) {
  if (!roles.includes(user.role)) {
    throw new AuthError(`Access denied. Required: ${roles.join(" or ")}, got: ${user.role}`, 403);
  }
}

export function isAdmin(user: HdUser) {
  return user.role === "HELPDESK_ADMIN";
}

export function isAgentOrAbove(user: HdUser) {
  return ["HELPDESK_ADMIN", "CATEGORY_LEAD", "AGENT"].includes(user.role);
}

export function isCustomer(user: HdUser) {
  return user.role === "CUSTOMER";
}
