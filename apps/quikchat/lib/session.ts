import type { OrgContext } from "@/lib/shared";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Reads the current NextAuth session and projects it to `{ userId, orgId }`.
 *
 * This is the single seam between "who is logged in" (QuikIT OIDC via NextAuth)
 * and the entitlement logic in `orgAuth.ts`. Tests mock THIS module to simulate
 * a signed-in user without standing up NextAuth.
 *
 * Projection note: QuikIT pins the user id as `session.user.id` (NOT `.userId`);
 * the org is `session.user.orgId`. Either missing → null (unauthenticated).
 */
export async function getRawSession(): Promise<OrgContext | null> {
  const session = await getServerSession(authOptions);
  // Cast locally so this module doesn't depend on the next-auth module
  // augmentation being in the compiling project's scope (Next's build typechecks
  // a narrower file set than the workspace `tsc`).
  const user = session?.user as { id?: string; orgId?: string } | undefined;
  const userId = user?.id;
  const orgId = user?.orgId;
  if (!userId || !orgId) return null;
  return { userId, orgId };
}

/**
 * The identity fields an app-access check needs. Strictly a superset of
 * `OrgContext` — see `getSessionPrincipal`.
 */
export interface SessionPrincipal {
  userId: string;
  orgId: string;
  isSuperAdmin: boolean;
  membershipRole: string | undefined;
}

/**
 * Same session read as `getRawSession`, projected wide enough to answer "may
 * this user open QuikChat" via `getAppAccess` from `@quikit/auth/app-access`.
 *
 * Exists because `getRawSession`'s deliberate `{ userId, orgId }` projection
 * drops `membershipRole`, and `getAppAccess` rule 3 grants org admins access on
 * org-level entitlement alone. Passing `memberRole: undefined` would silently
 * DENY an org admin who has org access but no explicit `UserAppAccess` row —
 * so the role has to survive the projection, not be filled in with a default.
 *
 * Additive on purpose: `getRawSession` keeps its signature and every existing
 * caller. Use that one when you only need the org boundary; use this one when
 * you need entitlement.
 *
 * Note on `isSuperAdmin`: QuikChat is an OAuth-client app, so
 * `createOAuthClientOptions` hardcodes it false and org admins pass via
 * `membershipRole` instead. Read here regardless, to mirror the argument set
 * `(dashboard)/layout.tsx` passes rather than encode a QuikChat-only shortcut.
 */
export async function getSessionPrincipal(): Promise<SessionPrincipal | null> {
  const session = await getServerSession(authOptions);
  // Local cast for the same reason as above.
  const user = session?.user as
    | { id?: string; orgId?: string; isSuperAdmin?: boolean; membershipRole?: string }
    | undefined;
  const userId = user?.id;
  const orgId = user?.orgId;
  if (!userId || !orgId) return null;
  return {
    userId,
    orgId,
    isSuperAdmin: user?.isSuperAdmin === true,
    membershipRole: user?.membershipRole,
  };
}

/**
 * Platform contract aliases. `auth()` / `getSession()` return the raw session
 * WITHOUT re-checking entitlement — use `getOrgId()` / `withOrgAuth()` when you
 * need the org boundary enforced.
 */
export const auth = getRawSession;
export const getSession = getRawSession;
