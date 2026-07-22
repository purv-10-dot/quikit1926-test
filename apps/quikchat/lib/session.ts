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
 * Platform contract aliases. `auth()` / `getSession()` return the raw session
 * WITHOUT re-checking entitlement — use `getOrgId()` / `withOrgAuth()` when you
 * need the org boundary enforced.
 */
export const auth = getRawSession;
export const getSession = getRawSession;
