import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
// The generated client exports this as `LmsUserRole`; the codebase aliases it
// to `UserRole` (see lib/auth/resolve-role.ts).
import type { LmsUserRole as UserRole } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { hasCentralAppAccess } from '@/lib/auth/central-access';
import { resolveLmsRole } from '@/lib/auth/resolve-role';
import { landingPathFor, resolveTenantType } from '@/lib/auth/landing';

/**
 * Server-side role gate for route-group layouts (F-001).
 *
 * WHY THIS EXISTS. `middleware.ts` enforces authentication only, and the nine
 * route-group layouts rendered `<AppShell role="â€¦">` chrome without reading the
 * session at all â€” so any authenticated user could load any dashboard. Nothing
 * leaked, because every privileged XHR behind those pages 403s server-side, but
 * the pages themselves rendered, and the middleware comment claimed a
 * protection that was never implemented.
 *
 * DESIGN NOTES, both deliberate:
 *
 *  1. It resolves the role with `resolveLmsRole` â€” the SAME resolver
 *     `getAuthContext` uses for the API guards. Page gating and route gating
 *     therefore cannot drift apart; a role that can call the endpoints can
 *     always reach the page that calls them. That now includes the ACTIVE role
 *     of a multi-role user (lib/auth/active-role.ts): the gate is deliberately
 *     keyed on the role they SWITCHED to, not on every role they hold, because
 *     `requireAuth` grants the switched role's permissions on the same basis. A
 *     held-but-not-active role would open the page while the API behind it still
 *     refused — exactly the drift this note rules out.
 *
 *  2. A refused user is REDIRECTED to their own landing page, never shown a
 *     403 wall. The failure mode of a too-strict gate is locking a legitimate
 *     user out of their own product, which is worse than the bug being fixed â€”
 *     so the unhappy path lands somewhere useful.
 *
 * SUPER_ADMIN passes everywhere by design: it is the cross-tenant support role
 * and `tenantWhere()` already grants it unscoped data access.
 */

/**
 * Authentication-only variant, for the `(shared)` group.
 *
 * `(shared)` is multi-role by design, so it takes no role list — but it still has
 * to know WHICH role to render chrome for. It previously did not ask: the layout
 * rendered `<AdaptiveShell>`, which read the navigation role from
 * `localStorage.qs_role` and fell back to LEARNER when absent. On a fresh browser
 * — i.e. every first visit — six of the seven roles therefore got the LEARNER
 * sidebar on /profile, /messages, /reset-password and /video/[id]
 * (`__tests__/e2e/ui/phase36-shared-pages.spec.ts` records this).
 *
 * That also broke the role switcher's second half: `(sub-admin)` nav links into
 * shared pages, so a user who had just switched to Sub Admin landed on one and
 * watched the sidebar revert. Resolving the ACTIVE role here — the same resolver
 * the role-gated groups use — makes the switch hold across every group, and takes
 * the navigation role off a client-writable key at the same time.
 *
 * Same entitlement bounce and same `/login` redirect as `requirePageRoles`; only
 * the role GATE is absent, because there is nothing to gate on.
 */
export async function resolveActivePageRole(): Promise<UserRole> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  const entitled = await hasCentralAppAccess({
    id: session.user.id,
    orgId: session.user.orgId,
    isSuperAdmin: session.user.isSuperAdmin,
  });
  if (!entitled) redirect('/?reason=no_app_access');

  return resolveLmsRole(session.user);
}

export async function requirePageRoles(allowed: UserRole[]): Promise<UserRole> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect('/login');

  // Central entitlement + membership gate, BEFORE the role gate â€” "may you open
  // QuikLMS at all" is a strictly coarser question than "which dashboard is
  // yours", and answering them in the other order would send a user with no
  // entitlement to a role landing page they equally cannot use.
  //
  // The bounce carries `reason=no_app_access`, which the landing page checks so
  // it does NOT redirect an authenticated visitor onward (see
  // app/(marketing)/page.tsx). Without that flag this redirect and the landing
  // page's own role redirect would ping-pong forever.
  const entitled = await hasCentralAppAccess({
    id: session.user.id,
    orgId: session.user.orgId,
    isSuperAdmin: session.user.isSuperAdmin,
  });
  if (!entitled) redirect('/?reason=no_app_access');

  const role = await resolveLmsRole(session.user);
  if (role === 'SUPER_ADMIN' || allowed.includes(role)) return role;

  // A TENANT_ADMIN's landing page depends on whether they run a school or a
  // corporate tenant â€” bouncing every one of them to /tenant-dashboard sent
  // school admins to the corporate dashboard. See lib/auth/landing.ts.
  const tenantType = await resolveTenantType(session.user.orgId);
  redirect(landingPathFor(role, tenantType));
}
