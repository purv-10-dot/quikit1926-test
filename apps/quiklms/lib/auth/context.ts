/**
 * Server-side auth context — the single entry point every LMS API route and
 * service reads through (~335 files). It now derives from the REAL centralized
 * NextAuth session (QuikIT OAuth SSO) instead of the retired `qs_role` dev
 * cookie. The exported surface (getAuthContext / requireAuth / requireRoles /
 * userHasRole / tenantWhere / assertTenantMatch / requireFeature / AuthUser) is
 * intentionally UNCHANGED so no caller needs editing.
 *
 * orgId-native (quikscale parity): LMS business tables are keyed on `orgId` —
 * the platform Org id — directly (the orgId column was renamed to orgId and
 * its values re-keyed to the platform orgId). So `getAuthContext` exposes a
 * single `orgId` that is both the identity and the scope key. `tenantWhere` /
 * `assertTenantMatch` keep their names (used by ~324 call sites) but now filter
 * on `orgId`.
 */
import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import type { LmsUserRole as UserRole } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { prisma } from '@/lib/prisma';
import { Forbidden, Unauthorized } from '@/lib/http';
import type { FeatureSet } from '@/lib/features';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  secondaryRole: UserRole | null;
  /** Platform Org id — the identity AND the scope key for all LMS tables. */
  orgId: string | null;
  tenantType: 'corporate' | 'school' | null;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

/**
 * Resolve the current actor from the centralized session cookie. The optional
 * `req` param is retained only for call-site compatibility — `getServerSession`
 * reads the cookie via `next/headers`, so the argument is ignored.
 */
export async function getAuthContext(_req?: NextRequest): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user;
  if (!u?.id || !u.orgId) return null;

  // Prefer the LMS row's role when this user has one. People created via the
  // roster share their central id with the LMS row (see identity-service), so
  // this yields the correct fine-grained role (TEACHER / PARENT / LEARNER / …).
  // Fall back to the coarse platform membership-role mapping when no LMS row
  // exists yet (e.g. org admins who never went through the roster).
  let lmsRole: UserRole | null = null;
  let secondaryRole: UserRole | null = null;
  let isActive = true;
  let tenantType: 'corporate' | 'school' | null = null;
  // True when this org has a QuikLMS `Tenant` row — i.e. it's a real
  // school/corporate tenant, not the operator org. Used to keep the coarse
  // role fallback from labeling a tenant admin as the operator (SUPER_ADMIN).
  let hasTenantRow = false;

  // The LMS `User` row and the `Tenant` row are resolved independently — a
  // failure on one must NOT drop the other. The async thunks defer the prisma
  // property access into the promise, so even a mocked client that omits
  // `tenant` degrades to a rejected settle (tenantType stays null) instead of a
  // synchronous throw. Tenant.id === orgId (orgId-native), so the tenant lookup
  // is a PK hit; the operator (SUPER_ADMIN) org has no Tenant row → stays null.
  const [rowRes, tenantRes] = await Promise.allSettled([
    (async () =>
      prisma.lmsUser.findUnique({
        where: { id: u.id },
        select: { role: true, secondaryRole: true, isActive: true },
      }))(),
    (async () =>
      prisma.lmsTenant.findUnique({
        where: { id: u.orgId },
        select: { tenantType: true },
      }))(),
  ]);

  if (rowRes.status === 'fulfilled' && rowRes.value) {
    lmsRole = rowRes.value.role;
    secondaryRole = rowRes.value.secondaryRole ?? null;
    isActive = rowRes.value.isActive;
  }
  if (tenantRes.status === 'fulfilled' && tenantRes.value) {
    tenantType = tenantRes.value.tenantType;
    hasTenantRow = true;
  }

  return {
    id: u.id,
    email: u.email ?? '',
    role: lmsRole ?? mapPlatformRoleToLmsRole(u.membershipRole, u.isSuperAdmin, hasTenantRow),
    secondaryRole,
    orgId: u.orgId,
    // Resolved from the tenant row (school/corporate) so server-side role
    // filtering — e.g. hiding TEACHER/PARENT for corporate tenants in
    // /api/users — works. Null for the operator org (no Tenant row).
    tenantType,
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    isActive,
  };
}

export async function requireAuth(req?: NextRequest): Promise<AuthUser> {
  const user = await getAuthContext(req);
  if (!user) throw Unauthorized('Not authenticated.');
  // A deactivated LMS user (via the tenant-admin Activate/Deactivate toggle /
  // /api/users/[id]/toggle-active) must be locked out even while their central
  // session cookie is still valid. `isActive` defaults to true for users with
  // no LMS row (e.g. org admins who never went through the roster), so this
  // only rejects rows explicitly deactivated in the LMS.
  if (!user.isActive) throw Forbidden('Your account has been deactivated.');
  return user;
}

export function userHasRole(user: AuthUser, role: UserRole): boolean {
  return user.role === role || user.secondaryRole === role;
}

export function requireRoles(user: AuthUser, roles: UserRole[]): void {
  const ok = roles.some((r) => userHasRole(user, r));
  if (!ok) throw Forbidden(`Access denied. Required: ${roles.join(' or ')}. Current role: ${user.role}`);
}

export async function requireFeature(user: AuthUser, _feature: keyof FeatureSet) {
  return { id: user.orgId, tenantType: user.tenantType } as never;
}

export function tenantWhere<T extends Record<string, unknown>>(
  user: AuthUser,
  extra: T = {} as T,
): T & { orgId?: string } {
  if (user.role === 'SUPER_ADMIN') return extra;
  return { ...extra, orgId: user.orgId ?? '__no_org__' };
}

export function assertTenantMatch(user: AuthUser, resourceOrgId?: string | null): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (resourceOrgId && user.orgId && resourceOrgId !== user.orgId) {
    throw Forbidden('Access denied: cross-tenant access not allowed');
  }
}
