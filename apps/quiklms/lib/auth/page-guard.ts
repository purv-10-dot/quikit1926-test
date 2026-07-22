import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
// The generated client exports this as `LmsUserRole`; the codebase aliases it
// to `UserRole` (see lib/auth/resolve-role.ts).
import type { LmsUserRole as UserRole } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { resolveLmsRole } from '@/lib/auth/resolve-role';

/**
 * Server-side role gate for route-group layouts (F-001).
 *
 * WHY THIS EXISTS. `middleware.ts` enforces authentication only, and the nine
 * route-group layouts rendered `<AppShell role="…">` chrome without reading the
 * session at all — so any authenticated user could load any dashboard. Nothing
 * leaked, because every privileged XHR behind those pages 403s server-side, but
 * the pages themselves rendered, and the middleware comment claimed a
 * protection that was never implemented.
 *
 * DESIGN NOTES, both deliberate:
 *
 *  1. It resolves the role with `resolveLmsRole` — the SAME resolver
 *     `getAuthContext` uses for the API guards. Page gating and route gating
 *     therefore cannot drift apart; a role that can call the endpoints can
 *     always reach the page that calls them.
 *
 *  2. A refused user is REDIRECTED to their own landing page, never shown a
 *     403 wall. The failure mode of a too-strict gate is locking a legitimate
 *     user out of their own product, which is worse than the bug being fixed —
 *     so the unhappy path lands somewhere useful.
 *
 * SUPER_ADMIN passes everywhere by design: it is the cross-tenant support role
 * and `tenantWhere()` already grants it unscoped data access.
 */
const LANDING: Record<string, string> = {
  SUPER_ADMIN: '/dashboard',
  TENANT_ADMIN: '/tenant-dashboard',
  SUB_ADMIN: '/sub-admin-dashboard',
  MANAGER: '/manager-dashboard',
  TEACHER: '/teacher-dashboard',
  PARENT: '/parent-dashboard',
  LEARNER: '/learner/dashboard',
};

export async function requirePageRoles(allowed: UserRole[]): Promise<UserRole> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const role = await resolveLmsRole(session.user);
  if (role === 'SUPER_ADMIN' || allowed.includes(role)) return role;

  redirect(LANDING[role] ?? '/learner/dashboard');
}
