/**
 * Held roles + the ACTIVE one — the server-side half of the header role switcher.
 *
 * THE BUG THIS EXISTS TO FIX. A tenant admin grants a second role with
 * `PATCH /api/users/:id/promote-subadmin`, which writes
 * `LmsUser.secondaryRole = 'SUB_ADMIN'`. Nothing on the server ever read that
 * column for authorisation: BOTH role resolvers — `getAuthContext` for the API
 * guards and `resolveLmsRole` for the page guards — go assigned app role →
 * `LmsUser.role` → coarse membership mapping and stop. So a promoted teacher
 * stayed a TEACHER everywhere, and the "Switch role → Sub Admin" item in
 * `components/AppShell.tsx` could not work: it set a cookie and navigated to
 * `/sub-admin-dashboard`, whose layout calls
 * `requirePageRoles(['TENANT_ADMIN', 'SUB_ADMIN'])`, which resolved TEACHER and
 * bounced the user straight back to `/teacher-dashboard`. The switcher was
 * cosmetic: the cookie it wrote was the RETIRED dev cookie that no server code
 * reads any more (see the header of lib/auth/context.ts).
 *
 * WHY A COOKIE IS SAFE HERE, WHEN THE DEV `qs_role` COOKIE WAS NOT. The old dev
 * cookie *was* the role — whatever it said, you were. This treats it as a
 * REQUEST: `resolveActiveRole` only honours a value that appears in the set of
 * roles the user demonstrably holds, which is derived entirely from the database
 * (their resolved role plus `LmsUser.secondaryRole`). A hand-written
 * `qs_role=SUPER_ADMIN` therefore still resolves to whatever the database says
 * the user is — the property `__tests__/e2e/ui/phase20-page-gating.spec.ts`
 * asserts, and the reason this is a switcher rather than a role override.
 *
 * `qs_role` is reused rather than a new cookie name introduced because two
 * client readers already treat it as the active role
 * (`components/AdaptiveShell.tsx`, `app/(shared)/messages/page.tsx`); a second
 * cookie would just give them something to drift from.
 */
import { cookies } from 'next/headers';
import type { LmsUserRole as UserRole } from '@prisma/client';
import { isUserRole } from '@/lib/auth/role-policy';

/** The cookie `AppShell.activateRole` writes when the user picks a role. */
export const ACTIVE_ROLE_COOKIE = 'qs_role';

/**
 * The roles this user may act as, DEFAULT FIRST.
 *
 * The order is load-bearing: index 0 is what they get with no cookie, so it must
 * stay the role they resolved to before this module existed. Otherwise granting
 * someone a second role would silently move their landing page — the exact class
 * of bug `lib/auth/landing.ts` was written to end.
 *
 * `secondaryRole` is the only source of a second role today (written by
 * `promoteToSubAdmin`, cleared by `revokeSubAdmin`), so a revocation removes the
 * role from this set on the next request and the active-role cookie stops being
 * honoured on its own — no separate cleanup path.
 */
export function heldRoles(effective: UserRole, secondary?: UserRole | null): UserRole[] {
  return secondary && secondary !== effective ? [effective, secondary] : [effective];
}

/**
 * The role the browser is asking to act as, or null. NEVER trusted on its own —
 * always passed through `resolveActiveRole` against a DB-derived held set.
 */
export function readRequestedRole(): UserRole | null {
  try {
    const raw = cookies().get(ACTIVE_ROLE_COOKIE)?.value;
    if (!raw) return null;
    const value = decodeURIComponent(raw);
    return isUserRole(value) ? value : null;
  } catch {
    // No request scope (a service called directly, or a unit test) — there is no
    // cookie jar to read, which is simply "no role requested".
    return null;
  }
}

/** `requested` when the user actually holds it; otherwise the held default. */
export function resolveActiveRole(held: UserRole[], requested?: UserRole | null): UserRole {
  if (requested && held.includes(requested)) return requested;
  return held[0];
}
