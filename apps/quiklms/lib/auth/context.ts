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
import { hasCentralAppAccess } from '@/lib/auth/central-access';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { prisma } from '@/lib/prisma';
import { Forbidden, Unauthorized } from '@/lib/http';
import { isFeatureEnabled, type FeatureSet } from '@/lib/features';

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
  /**
   * Platform super-admin flag, carried straight from the session claim. Needed
   * by the central entitlement gate in `requireAuth` (see lib/auth/central-access)
   * — the coarse `role` field can't stand in for it, because a platform super
   * admin who also has an LMS row resolves to that row's fine-grained role.
   */
  isSuperAdmin: boolean;
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
    isSuperAdmin: u.isSuperAdmin === true,
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

  // Central entitlement + membership gate (baseline §3/§4). This is the ONLY
  // place the ~346 API routes get it: `middleware.ts` returns early for `/api`,
  // so the remote-session validation that catches suspended orgs and expired
  // trials never reaches them.
  //
  // 403, never 401. `lib/api.ts` treats a 401 as "session expired" and hard-
  // navigates to `/login`, which re-initiates SSO and lands the same user back
  // here — an infinite login loop. A 403 surfaces as a normal API error the
  // caller can render.
  if (!(await hasCentralAppAccess(user))) {
    throw Forbidden('You do not have access to QuikLMS in this organization.');
  }

  return user;
}

export function userHasRole(user: AuthUser, role: UserRole): boolean {
  return user.role === role || user.secondaryRole === role;
}

export function requireRoles(user: AuthUser, roles: UserRole[]): void {
  const ok = roles.some((r) => userHasRole(user, r));
  if (!ok) throw Forbidden(`Access denied. Required: ${roles.join(' or ')}. Current role: ${user.role}`);
}

/**
 * Refuse the request when `feature` is switched off for the caller's tenant.
 *
 * This was a no-op stub — `return { … } as never` — so a guard named
 * `requireFeature` silently permitted everything. Nothing called it, which is
 * the only reason that never became a hole, but an exported guard that always
 * says yes is a trap for the next person who reaches for it.
 *
 * SCOPE, deliberately the LMS layer. `keyof FeatureSet` denotes an LMS tenant
 * feature (`showBatches`, `showPayouts`, …) resolved from
 * `LmsTenant.featureConfig` + `tenantType` by `lib/features.ts`. It is NOT a
 * platform module key: QuikLMS has no entry in `@quikit/shared`'s
 * MODULE_REGISTRY, so the central `AppModuleFlag` gate
 * (`@quikit/auth/feature-gate`) has nothing to resolve for this app and would
 * fail open on every call. Wiring that up means registering the app's module
 * tree first — a separate piece of work. The platform's app-level hard gate
 * (`OrgAppAccess.enabled`) is already enforced upstream by `requireAuth` via
 * `lib/auth/central-access`.
 *
 * FAILS OPEN, in two cases, both intentional:
 *   - No `LmsTenant` row for the org — the operator org has none, and a newly
 *     linked org may not have one yet. Neither should 403.
 *   - The lookup itself errors — a transient DB fault must not black out
 *     features tenant-wide. Same posture as `getAuthContext`'s settled reads
 *     and `packages/auth/feature-gate`'s catch blocks.
 */
export async function requireFeature(
  user: AuthUser,
  feature: keyof FeatureSet,
): Promise<{ id: string; tenantType: 'corporate' | 'school' } | null> {
  // Cross-tenant support role; its org has no tenant row to read a config from.
  if (user.role === 'SUPER_ADMIN' || !user.orgId) return null;

  let tenant: { id: string; tenantType: 'corporate' | 'school'; featureConfig: unknown } | null = null;
  try {
    tenant = await prisma.lmsTenant.findUnique({
      where: { id: user.orgId },
      select: { id: true, tenantType: true, featureConfig: true },
    });
  } catch {
    return null; // fail open — see above
  }
  if (!tenant) return null;

  if (!isFeatureEnabled(tenant as Parameters<typeof isFeatureEnabled>[0], feature)) {
    throw Forbidden(`This feature is not enabled for your organization.`);
  }
  return { id: tenant.id, tenantType: tenant.tenantType };
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
