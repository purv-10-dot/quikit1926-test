/**
 * Server-side auth context — the single entry point every LMS API route and
 * service reads through (~335 files). It now derives from the REAL centralized
 * NextAuth session (QuikIT OAuth SSO) instead of the retired dev-auth role
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
// RBAC v2 — grants are the authorisation source; see `requireRoles`.
import { loadMyPermissions, loadRoleGrants } from '@/lib/auth/permissions';
import { actionForMethod, resourceForPath, type Action } from '@/lib/auth/permissions-registry';
import { mapPlatformRoleToLmsRole } from '@/lib/auth/role-resolution';
import { getAssignedLmsRole } from '@/lib/auth/app-role';
import { healLmsRoleAssignment } from '@/lib/auth/heal-role-assignment';
import { lmsRoleToAppRoleName } from '@/lib/api/seed-lms-app-roles';
import { resolveCentralMembership } from '@/lib/auth/founding-admin';
import { db } from '@/lib/db';
import { Forbidden, Unauthorized } from '@/lib/http';
import { isFeatureEnabled, type FeatureSet } from '@/lib/features';

export interface AuthUser {
  id: string;
  email: string;
  /** The actor's single role. QuikLMS is single-role-per-user (quikscale parity). */
  role: UserRole;
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
  let isActive = true;
  let tenantType: 'corporate' | 'school' | null = null;
  // Platform-assigned per-app role (app_quiklms.UserAppRole → AppRole.name),
  // resolved the same way the other apps authorise. When present it OVERRIDES
  // the LMS row role below; when absent (the common case for users provisioned
  // before/without an explicit assignment) role resolution is unchanged.
  let assignedRole: UserRole | null = null;

  // The LMS `User` row and the `Tenant` row are resolved independently — a
  // failure on one must NOT drop the other. The async thunks defer the prisma
  // property access into the promise, so even a mocked client that omits
  // `tenant` degrades to a rejected settle (tenantType stays null) instead of a
  // synchronous throw. Tenant.id === orgId (orgId-native), so the tenant lookup
  // is a PK hit; the operator (ADMIN) org has no Tenant row → stays null.
  const [rowRes, tenantRes, assignedRes] = await Promise.allSettled([
    (async () =>
      db.lmsUser.findUnique({
        where: { id: u.id },
        select: { role: true, isActive: true },
      }))(),
    (async () =>
      db.lmsTenant.findUnique({
        where: { id: u.orgId },
        select: { tenantType: true },
      }))(),
    // Assigned per-app role — its own settle so an RBAC read failure never
    // drops the User/Tenant resolution (getAssignedLmsRole also catches).
    (async () => getAssignedLmsRole(u.id, u.orgId))(),
  ]);

  if (rowRes.status === 'fulfilled' && rowRes.value) {
    lmsRole = rowRes.value.role;
    isActive = rowRes.value.isActive;
  }
  // Tracked separately from `tenantType`: the question the role fallback asks is
  // "does this org have a tenant ROW", and a row whose `tenantType` were ever null
  // would answer that wrongly if inferred from the type alone.
  let isTenantOrg = false;
  if (tenantRes.status === 'fulfilled' && tenantRes.value) {
    tenantType = tenantRes.value.tenantType;
    isTenantOrg = true;
  }
  if (assignedRes.status === 'fulfilled' && assignedRes.value) {
    assignedRole = assignedRes.value;
  }

  // The central-membership lookup is deliberately LAZY — it only runs when neither
  // an assignment nor an LMS row answered, which is exactly the freshly-invited-admin
  // case it exists for. Resolving it inside the settle group above would put two
  // central queries on every request of every user who already has a row.
  //
  // `membership.role` (the authoritative `OrgMember.role`) is preferred over
  // `u.membershipRole` (the JWT claim), because on the SSO path that claim degrades
  // to the literal "member" — i.e. LEARNER — for an admin whose invitation had not
  // flipped to `active` when their token was minted, and it is never re-read for the
  // 7-day life of the session. See lib/auth/founding-admin.ts for the full trace.
  // The claim remains the fallback for when the central read finds nothing.
  let effectiveRole = assignedRole ?? lmsRole;
  if (!effectiveRole) {
    const membership = await resolveCentralMembership(u.id, u.orgId);
    // An `LmsTenant` row is what tells an onboarded tenant apart from a root org —
    // and therefore a TENANT_ADMIN apart from an ADMIN, since both were stored
    // centrally as `org_admin`. Already resolved above, so this costs no extra query.
    effectiveRole = mapPlatformRoleToLmsRole(
      membership.role ?? u.membershipRole,
      u.isSuperAdmin,
      isTenantOrg,
    );

    // Same one-time repair as the page guard: write the assignment we just
    // derived so `getAssignedLmsRole` answers the next request directly.
    healLmsRoleAssignment(u.id, u.orgId, effectiveRole, u.isSuperAdmin);
  }
  return {
    id: u.id,
    email: u.email ?? '',
    role: effectiveRole,
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

  // ── RBAC v2: load the effective grant set ONCE per request ─────────────────
  //
  // `requireRoles` is called synchronously from 292 handlers, so it cannot await a
  // permission query of its own. Resolving the whole set here — one query — lets
  // the gate stay synchronous while the DECISION comes entirely from grants. This
  // is the same information quikscale's `loadMyPermissions` returns; it just
  // resolves it per request instead of per check.
  //
  // Stored off the object, not on it, so `AuthUser`'s shape — read by ~335 files —
  // is unchanged.
  if (req) requestForUser.set(user, req);
  if (user.orgId) {
    try {
      const { permissions } = await loadMyPermissions(user.id, user.orgId);
      const grants = new Set(permissions);

      // NO ASSIGNMENT AT ALL → fall back to the grants of the role the actor
      // actually resolved to.
      //
      // `loadMyPermissions` derives everything from `LmsUserAppRole`, so a user with
      // no assignment row gets an empty set and, once grants became the gate, was
      // refused every request. That is not a hypothetical class of user: the platform
      // ADMIN operator has no LMS row and no assignment by nature — grants are
      // keyed `(userId, orgId)` and the operator is cross-tenant, so there is no org
      // for one to live in. The observable symptom was the operator being refused
      // `POST /api/tenants/onboard`, which surfaced to the user as "the invitation
      // email never arrived" — provisioning never got far enough to send one.
      //
      // This deliberately does NOT bypass on `isSuperAdmin`. A blanket operator
      // bypass would WIDEN access: plenty of routes gate on
      // `['TENANT_ADMIN','SUB_ADMIN']` and refused a ADMIN before this change
      // too. Reading the resolved role's grants instead reproduces the old decision
      // exactly — role decides — while keeping the POLICY in one place, the grants
      // table. `user.role` comes from `getAuthContext`, i.e. from the database, so
      // nothing here can grant a role the DB did not give them.
      // `loadRoleGrants` matches on `AppRole.name`, which is NOT the enum value for
      // the top tier: every writer stores it through `lmsRoleToAppRoleName`, so the
      // catalogue row is `admin` while `user.role` is `ADMIN` (see the doc on that
      // function). Passing the raw enum here looked for a row named `ADMIN`, found
      // none, and handed ADMIN an EMPTY grant set — which, since grants are the gate,
      // refused the operator every request that reached this fallback. The symptom was
      // `POST /api/tenants/onboard` failing with "your role (ADMIN) has no such grant"
      // for a pair the matrix explicitly grants ADMIN. The other six roles were
      // unaffected because their enum name and catalogue name are identical, which is
      // why this read as an ADMIN-only fault.
      if (grants.size === 0) {
        const appRoleName = lmsRoleToAppRoleName(user.role);
        for (const grant of await loadRoleGrants(user.orgId, appRoleName)) grants.add(grant);
      }

      grantsForUser.set(user, grants);
    } catch {
      // A failed grant read must not become an accidental grant. An absent set is
      // treated as "no permissions", and `RBAC_V2_ENFORCE=false` is the way out if
      // that is ever wrong in production.
      grantsForUser.set(user, new Set());
    }
  }

  return user;
}

/**
 * Per-request context, keyed by the `AuthUser` instance.
 *
 * A fresh user object is built per request, so entries are collected as soon as the
 * request ends — a WeakMap cannot leak here the way a keyed cache would.
 */
const requestForUser = new WeakMap<AuthUser, NextRequest>();
const grantsForUser = new WeakMap<AuthUser, Set<string>>();

/**
 * Kill switch for the authorisation cutover.
 *
 * Unset or anything other than `'false'` → grants decide (the QuikScale model).
 * `RBAC_V2_ENFORCE=false` → fall back to the old role-list check, unchanged.
 *
 * It exists because this app has no runnable test suite right now
 * (`@rolldown/binding-win32-x64-msvc` is missing, so vitest cannot start), which
 * means the cutover ships verified by typecheck and traffic rather than by tests.
 * One env var is a cheaper remedy than a revert.
 */
function rbacV2Enforced(): boolean {
  return process.env.RBAC_V2_ENFORCE !== 'false';
}

/**
 * The QuikScale-shaped gate: may this actor perform `action` on `resource`?
 *
 * Prefer this in new routes — an explicit (resource, action) pair at the call site
 * is what `withOrgAuthForResource` gives quikscale, and it does not depend on the
 * request path matching the resource by convention.
 *
 * Synchronous by design: the grant set was resolved in `requireAuth`.
 */
export function requirePermission(user: AuthUser, resource: string, action: Action): void {
  const grants = grantsForUser.get(user);
  if (grants?.has(`${resource}:${action}`)) return;
  throw Forbidden(`Access denied. Requires ${resource}:${action}. Role: ${user.role}`);
}

/** Non-throwing form, for conditional UI/logic rather than gating. */
export function actorCan(user: AuthUser, resource: string, action: Action): boolean {
  return grantsForUser.get(user)?.has(`${resource}:${action}`) === true;
}

/** Single-role model (quikscale parity) — there is no second held role anymore. */
export function userHasRole(user: AuthUser, role: UserRole): boolean {
  return user.role === role;
}

/**
 * The gate the 292 existing handlers call — now decided by GRANTS, not by the role
 * list they pass.
 *
 * WHY THE SIGNATURE DID NOT CHANGE. QuikScale's guards name a (resource, action)
 * pair; QuikLMS's name a role list. Rewriting 292 call sites across 264 files to
 * carry pairs would be a mechanical diff nothing here can test — vitest cannot
 * start in this environment. Instead the pair is derived from the request path and
 * method by the same rule the matrix generator used, so every one of those 292
 * sites is now grant-gated with no edit, and `requirePermission` is available for
 * new code that wants to be explicit.
 *
 * The `roles` argument is no longer consulted for the decision. It is kept because
 * it is the most accurate description of intent available for the error message,
 * and because `RBAC_V2_ENFORCE=false` restores it as the gate verbatim.
 *
 * FAILS CLOSED. No grant, no assignment, or no resolvable resource → Forbidden.
 * That is the property the old three-tier role fallback could not offer: it always
 * produced *some* role, so an emptied RBAC table silently downgraded a tenant admin
 * to LEARNER rather than refusing them.
 */
export function requireRoles(user: AuthUser, roles: UserRole[]): void {
  if (!rbacV2Enforced()) {
    const ok = roles.some((r) => userHasRole(user, r));
    if (!ok) throw Forbidden(`Access denied. Required: ${roles.join(' or ')}. Current role: ${user.role}`);
    return;
  }

  const req = requestForUser.get(user);
  const action = req ? actionForMethod(req.method) : null;
  const resource = req ? resourceForPath(new URL(req.url).pathname) : null;

  // No request context means this was called outside a route handler (a service or
  // a test calling it directly). There is no resource to check, so honour the role
  // list rather than refusing something the caller could never have satisfied.
  if (!resource || !action) {
    const ok = roles.some((r) => userHasRole(user, r));
    if (!ok) throw Forbidden(`Access denied. Required: ${roles.join(' or ')}. Current role: ${user.role}`);
    return;
  }

  if (actorCan(user, resource, action)) return;

  throw Forbidden(
    `Access denied. Requires ${resource}:${action} — your role (${user.role}) has no such grant.`,
  );
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
  // The platform OPERATOR has no tenant row to read a config from. Keyed on the
  // `isSuperAdmin` claim, not the role: an org's founding admin now resolves to an
  // LMS role of ADMIN (lib/auth/founding-admin.ts) but DOES have a tenant,
  // and returning null here would silently disable every feature flag for them.
  if (user.isSuperAdmin === true || !user.orgId) return null;

  let tenant: { id: string; tenantType: 'corporate' | 'school'; featureConfig: unknown } | null = null;
  try {
    tenant = await db.lmsTenant.findUnique({
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

/**
 * Quiz-proctoring gate — deliberately FAIL-CLOSED, unlike `requireFeature`.
 *
 * `requireFeature` returns null (fail OPEN) when the tenant row is missing, so a
 * feature stays on for an org that has no `LmsTenant`. That is the right default
 * for capability flags — a half-provisioned org should not lose its product.
 *
 * It is the WRONG default here. Orgs provisioned centrally (quikit/admin) get an
 * `OrgAppAccess` row but no `LmsTenant` row, and those are exactly the corporate
 * orgs that must NOT get webcam proctoring. Reusing `requireFeature` would leave
 * proctoring on for precisely the tenants this flag exists to exempt.
 *
 * So an absent tenant row resolves to `corporate`, matching the schema's own
 * `tenantType LmsTenantType @default(corporate)`. A DB error resolves the same
 * way: the failure mode is a plain unproctored quiz, never a blocked learner.
 */
export async function requireQuizProctoring(user: AuthUser): Promise<void> {
  // Platform operators keep access to the review surfaces they support.
  if (user.isSuperAdmin === true) return;

  let tenant: { tenantType: 'corporate' | 'school'; featureConfig: unknown } | null = null;
  if (user.orgId) {
    try {
      tenant = await db.lmsTenant.findUnique({
        where: { id: user.orgId },
        select: { tenantType: true, featureConfig: true },
      });
    } catch {
      tenant = null;
    }
  }

  const enabled = tenant
    ? isFeatureEnabled(tenant as Parameters<typeof isFeatureEnabled>[0], 'showQuizProctoring')
    : false;

  if (!enabled) {
    throw Forbidden('Quiz proctoring is not enabled for your organization.');
  }
}

export function tenantWhere<T extends Record<string, unknown>>(
  user: AuthUser,
  extra: T = {} as T,
): T & { orgId?: string } {
  // Cross-tenant reads require the PLATFORM FLAG, not the LMS role.
  //
  // This used to test `user.role === 'ADMIN'`, and returning `extra` drops the
  // `orgId` filter entirely — every tenant's rows, from ~324 call sites. Keying that
  // on the LMS role meant anything that could make `role` resolve to ADMIN
  // also silently granted cross-tenant read: the `org_admin` inference (49 tenant
  // admins, fixed in lib/auth/role-resolution.ts), an `LmsUser.role` column value, or
  // a `UserAppRole` assignment to the ADMIN AppRole. Three independent paths to
  // one org's data leaking into another's.
  //
  // `isSuperAdmin` is the platform operator claim, written only by the launcher's
  // `/api/super/users` console under `requireSuperAdmin` and audited there. It is the
  // same signal quikscale short-circuits on in `lib/api/visibility.ts` — quikscale
  // never unscopes ACROSS orgs at all, but where it does widen, it widens on the flag
  // rather than on a role string.
  //
  // Net effect: the 3 real operators keep cross-tenant access; an LMS role of
  // ADMIN no longer confers it.
  if (user.isSuperAdmin === true) return extra;
  return { ...extra, orgId: user.orgId ?? '__no_org__' };
}

/**
 * Is this actor the PLATFORM OPERATOR — the one actor entitled to cross-tenant data?
 *
 * The single predicate for that question. `role === 'ADMIN'` is NOT it, and
 * treating it as such is what leaked one org's data into another's console: an org's
 * founding admin holds the ADMIN role (lib/auth/founding-admin.ts) but is a
 * tenant person, and so is anyone whose `LmsUser.role` column or `UserAppRole`
 * assignment says ADMIN. Only `isSuperAdmin` — written by apps/quikit's audited
 * `/api/super/users` console — identifies the operator.
 *
 * Read as "unscoped?" at every branch that widens data access, so that adding a new
 * console route cannot silently default to platform-wide.
 */
export function isPlatformOperator(user: Pick<AuthUser, 'isSuperAdmin'>): boolean {
  return user.isSuperAdmin === true;
}

/**
 * The `orgId` a service call should be scoped to — `undefined` meaning "every
 * org", for the platform operator only.
 *
 * NOTE ON WHY WE SCOPE RATHER THAN DENY. The tempting alternative for the ~24
 * platform-console routes is a hard `if (!user.isSuperAdmin) throw Forbidden()`.
 * That is a footgun here: `createOAuthClientOptions` hardcodes
 * `token.isSuperAdmin = false` ("Apps don't inherit super admin status"), so NOBODY
 * arriving over SSO carries the operator claim — only the launcher hand-off does.
 * A deny-gate would therefore 403 genuine operators too. Scoping degrades correctly
 * for both: the operator sees everything when their claim survives, and everyone
 * else sees only their own org either way.
 *
 * `tenantWhere` covers the ~324 call sites that build a Prisma `where` themselves.
 * A dozen handlers instead pass an `orgId | undefined` down into a service
 * (`/api/users`, `/api/users/search`, `/api/users/:id`, `…/toggle-active`), and
 * each had written the rule out by hand as:
 *
 *     const orgId = actor.role === 'ADMIN' ? undefined : actor.orgId ?? undefined;
 *
 * That is the ROLE, and it bypassed `tenantWhere`'s flag check entirely — so every
 * path that can make `role` resolve to ADMIN (an `LmsUser.role` value, a
 * UserAppRole assignment, or the founding-admin mapping in
 * lib/auth/founding-admin.ts) silently listed and mutated every tenant's users.
 * One helper, keyed on the same platform claim `tenantWhere` uses, so the two
 * cannot drift again.
 */
export function orgScope(user: AuthUser): string | undefined {
  if (isPlatformOperator(user)) return undefined;
  return user.orgId ?? undefined;
}

/**
 * Every org id this actor may see on the CONSOLE screens — their own, plus every org
 * they onboarded. `undefined` means "all orgs" and is the platform operator only.
 *
 * WHY `orgScope` IS NOT ENOUGH HERE. `orgScope` answers "which single org owns this
 * row", which is right for `/api/users`, progress, courses and the rest of the LMS
 * domain. It is WRONG for the Tenants screen: `onboardTenant` creates a BRAND-NEW Org
 * and sets `LmsTenant.id = orgId = <the new org's id>`, so a tenant an admin onboards
 * is a different org from their own. Filtering on `id === user.orgId` therefore matched
 * only their own org's tenant record and hid every tenant they had just created — the
 * "I created a corporate tenant and the Tenants tab is empty" report.
 *
 * The link back is `Org.createdBy`, written by `provisionOrgForTenant`. One level deep,
 * deliberately: an org onboarded by one of your clients is your client's, not yours.
 *
 * Fails safe — on a read error the actor still sees their own org, never everyone's.
 */
export async function visibleOrgIds(user: AuthUser): Promise<string[] | undefined> {
  if (isPlatformOperator(user)) return undefined;

  const ids = new Set<string>();
  if (user.orgId) ids.add(user.orgId);
  try {
    const owned = await db.org.findMany({
      where: { createdBy: user.id },
      select: { id: true },
    });
    for (const o of owned) ids.add(o.id);
  } catch {
    // Own org only — the safe direction.
  }
  return [...ids];
}

/**
 * Throw unless `targetOrgId` is one this actor may act on.
 *
 * For the handful of console routes that take an org/tenant id as a PATH or QUERY
 * parameter — `/api/tenants/[id]`, `/api/audit/email-status/[tenantId]`,
 * `/api/audit/upgrade-invoice/[tenantId]`, `/api/audit/activity-logs?orgId=` — where
 * `requireRoles(['ADMIN'])` was the only gate, so a caller holding the role
 * could simply name another org in the URL.
 */
export async function assertOrgAccess(user: AuthUser, targetOrgId?: string | null): Promise<void> {
  if (isPlatformOperator(user)) return;
  if (!targetOrgId) return; // Nothing named → the handler falls back to their own org.
  // Their own org OR one they onboarded — the same set the Tenants list shows, so a
  // tenant they can SEE is a tenant they can open. Testing `!== user.orgId` alone
  // would 403 every tenant they had just created.
  const allowed = await visibleOrgIds(user);
  if (allowed && !allowed.includes(targetOrgId)) {
    throw Forbidden('Access denied: cross-tenant access not allowed');
  }
}

export function assertTenantMatch(user: AuthUser, resourceOrgId?: string | null): void {
  // Same rule as `tenantWhere` above, and for the same reason: cross-tenant access
  // requires the PLATFORM FLAG, never the LMS role. This tested
  // `user.role === 'ADMIN'`, which left a hole the sibling guard had already
  // closed — anything that made `role` resolve to ADMIN (an `LmsUser.role`
  // column value, a UserAppRole assignment, or the founding-admin mapping added in
  // lib/auth/founding-admin.ts) skipped the org check on every fetch-by-id.
  if (user.isSuperAdmin === true) return;
  if (resourceOrgId && user.orgId && resourceOrgId !== user.orgId) {
    throw Forbidden('Access denied: cross-tenant access not allowed');
  }
}
