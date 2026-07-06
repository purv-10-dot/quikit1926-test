/**
 * Server-side auth context — the single entry point every LMS API route and
 * service reads through (~335 files). It now derives from the REAL centralized
 * NextAuth session (QuikIT OAuth SSO) instead of the retired `qs_role` dev
 * cookie. The exported surface (getAuthContext / requireAuth / requireRoles /
 * userHasRole / tenantWhere / assertTenantMatch / requireFeature / AuthUser) is
 * intentionally UNCHANGED so no caller needs editing.
 *
 * Phase-3 note: `tenantId` below is populated from the platform `orgId`. Until
 * the `tenantId → orgId` DB fold lands, LMS business tables still key on their
 * own `tenantId` values, so `tenantWhere()` filters will not match real orgs —
 * authentication is live, org-scoped DATA resolves after Phase 3.
 */
import type { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import type { UserRole } from '@prisma/client';
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
  tenantId: string | null;
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
  try {
    const row = await prisma.user.findUnique({
      where: { id: u.id },
      select: { role: true, secondaryRole: true, isActive: true },
    });
    if (row) {
      lmsRole = row.role;
      secondaryRole = row.secondaryRole ?? null;
      isActive = row.isActive;
    }
  } catch {
    /* LMS DB unavailable — fall back to the session-derived role below. */
  }

  return {
    id: u.id,
    email: u.email ?? '',
    role: lmsRole ?? mapPlatformRoleToLmsRole(u.membershipRole, u.isSuperAdmin),
    secondaryRole,
    // orgId occupies the tenantId slot until the Phase 3 tenantId→orgId fold.
    tenantId: u.orgId,
    // No platform equivalent yet; corporate/school branches degrade to a
    // neutral default until the LMS profile provides it (Phase 3).
    tenantType: null,
    firstName: u.firstName ?? '',
    lastName: u.lastName ?? '',
    isActive,
  };
}

export async function requireAuth(req?: NextRequest): Promise<AuthUser> {
  const user = await getAuthContext(req);
  if (!user) throw Unauthorized('Not authenticated.');
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
  return { id: user.tenantId, tenantType: user.tenantType } as never;
}

export function tenantWhere<T extends Record<string, unknown>>(
  user: AuthUser,
  extra: T = {} as T,
): T & { tenantId?: string } {
  if (user.role === 'SUPER_ADMIN') return extra;
  return { ...extra, tenantId: user.tenantId ?? '__no_tenant__' };
}

export function assertTenantMatch(user: AuthUser, resourceTenantId?: string | null): void {
  if (user.role === 'SUPER_ADMIN') return;
  if (resourceTenantId && user.tenantId && resourceTenantId !== user.tenantId) {
    throw Forbidden('Access denied: cross-tenant access not allowed');
  }
}
