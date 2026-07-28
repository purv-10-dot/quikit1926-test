/**
 * Central entitlement + membership gate — the platform contract QuikLMS was
 * missing (baseline §3 "active membership" and §4 "canonical visibility rule").
 *
 * WHY THIS EXISTS. Until now the LMS trusted `session.user.orgId` verbatim:
 * `getAuthContext` read the JWT claim and never re-checked the platform tables.
 * Two holes followed from that.
 *
 *   1. NO ENTITLEMENT CHECK. Nothing verified that the org had actually been
 *      granted QuikLMS (`OrgAppAccess.enabled`), that a per-app trial was still
 *      live (`trialEndsAt`), or that a non-admin member held an explicit
 *      `UserAppAccess` row. Any user with a valid central session and an orgId
 *      could use the app, and an expired trial revoked nothing.
 *
 *   2. NO MEMBERSHIP RE-VALIDATION. §3 requires BOTH `OrgMember.status` and
 *      `Org.status` to be active. A revoked member — or a member of a suspended
 *      org — kept full API access until their JWT happened to refresh.
 *
 * Both are closed by delegating to `createGetOrgId`, the SAME shared factory the
 * other product apps use. We do NOT re-implement the rule here: re-implementing
 * it is exactly how `/api/me/apps` drifted from the launcher. The factory
 * already layers a 60s LRU + Redis cache over the lookups, so the cost on the
 * hot path is ~zero and revocation still propagates within a minute.
 *
 * WHY MIDDLEWARE COULDN'T DO THIS. `middleware.ts` returns early for every
 * `/api` path (it only forwards the tenant subdomain header there), so the
 * remote-session validation that catches suspended orgs never runs on API
 * routes — which is where all the data is. The gate has to live in the request
 * guards, and it does: `requireAuth` (346 files) and `requirePageRoles` (the
 * seven role-gated route groups).
 *
 * SUPER_ADMIN BYPASS, deliberate. The platform operator is a cross-tenant
 * support role whose own org legitimately has no `OrgAppAccess` row for
 * QuikLMS — gating it on org entitlement would lock the operator out of the
 * product they operate. This matches the two bypasses already in the codebase:
 * `tenantWhere()` grants SUPER_ADMIN unscoped data access, and
 * `requirePageRoles` lets SUPER_ADMIN pass every route group.
 */
import { createGetOrgId } from '@quikit/auth/get-tenant-id';
import { authOptions } from '@/lib/auth';

/** This app's slug in the platform `App` catalog. */
export const APP_SLUG = 'quiklms';

/**
 * Module-level so the factory (and therefore its cache keys) is created once
 * per process, not once per request.
 */
const getValidatedOrgId = createGetOrgId(authOptions, { appSlug: APP_SLUG });

export interface CentralAccessInput {
  /** Platform `User.id` — also the LMS row id (orgId-native fold). */
  id: string;
  /** Platform `Org.id` from the session claim. */
  orgId?: string | null;
  isSuperAdmin?: boolean;
}

/**
 * True when this user may currently open QuikLMS in their selected org.
 *
 * Returns a plain boolean rather than throwing so both callers can pick their
 * own failure mode: the API guard needs a 403, the page guard needs a redirect.
 * Never throws — a `null` from the factory is an ordinary "no access" answer.
 */
export async function hasCentralAppAccess(user: CentralAccessInput): Promise<boolean> {
  if (user.isSuperAdmin === true) return true;
  if (!user.orgId) return false;

  // `createGetOrgId` re-validates the OrgMember row is active, then applies the
  // canonical app-access rule for `appSlug`. It returns the validated orgId on
  // success and null on any failure. Compare rather than truth-test so a
  // mismatch (session claim vs. validated org) can never read as a pass.
  const validated = await getValidatedOrgId(user.id);
  return validated !== null && validated === user.orgId;
}
