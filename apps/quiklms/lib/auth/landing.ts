/**
 * Where each role lands — the SINGLE source of truth.
 *
 * THE BUG THIS EXISTS TO FIX. Four separate tables (`app/(marketing)/page.tsx`,
 * `app/not-found.tsx`, `lib/auth/page-guard.ts`, `components/AppShell.tsx`) each
 * hardcoded `TENANT_ADMIN: '/tenant-dashboard'`. But this app has TWO
 * tenant-admin dashboards:
 *
 *   /tenant-dashboard  — corporate: learners, managers, course assignments
 *   /school-dashboard  — school:    students, teachers, batches, attendance
 *
 * So the administrator of a SCHOOL tenant was always dropped on the CORPORATE
 * dashboard, no matter that their tenant was created as a school. The school
 * dashboard existed and was simply unreachable by default.
 *
 * The landing target therefore depends on BOTH the role and the tenant kind.
 * Keeping that in one function is the point: four copies is exactly how they
 * drifted from the product in the first place.
 */
export type TenantKind = 'corporate' | 'school' | null | undefined;

/** Role → landing path, for roles whose destination does not vary by tenant. */
const FIXED: Record<string, string> = {
  SUPER_ADMIN: '/dashboard',
  SUB_ADMIN: '/sub-admin-dashboard',
  MANAGER: '/manager-dashboard',
  TEACHER: '/teacher-dashboard',
  PARENT: '/parent-dashboard',
  LEARNER: '/learner/dashboard',
};

export const DEFAULT_LANDING = '/learner/dashboard';

/**
 * The tenant kind for an org, for server components that only hold a session.
 *
 * `LmsTenant.id === orgId` (orgId-native), so this is a PK hit. Returns null for
 * the operator org, which has no tenant row — and on any error, so a lookup
 * failure degrades to the corporate default rather than failing the render.
 */
export async function resolveTenantType(orgId: string | null | undefined): Promise<TenantKind> {
  if (!orgId) return null;
  try {
    const { db } = await import('@/lib/db');
    const t = await db.lmsTenant.findUnique({
      where: { id: orgId },
      select: { tenantType: true },
    });
    return t?.tenantType === 'school' ? 'school' : t ? 'corporate' : null;
  } catch {
    return null;
  }
}

export function landingPathFor(role: string | null | undefined, tenantType?: TenantKind): string {
  // A tenant admin's home depends on which kind of tenant they administer.
  // `school` must be explicit — an unknown/absent type falls back to the
  // corporate dashboard, which is the historical behaviour and the safer
  // default (it does not assume school features exist).
  if (role === 'TENANT_ADMIN') {
    return tenantType === 'school' ? '/school-dashboard' : '/tenant-dashboard';
  }
  return FIXED[role ?? ''] ?? DEFAULT_LANDING;
}
