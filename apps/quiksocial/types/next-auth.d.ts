export {};

/**
 * QuikSocial-LOCAL next-auth augmentation.
 *
 * Adds `timezone` to next-auth's `User` so the session callback in
 * `lib/auth.ts` can attach the user's profile IANA zone. That activates the
 * ported F2 scheduling feature: `getUserTimezone(session)` resolves the real
 * zone instead of always falling back to "UTC".
 *
 * Why `User` and not `Session["user"]`: the shared `packages/auth/types.ts`
 * already declares `Session["user"]` as a concrete inline intersection, and a
 * second module augmentation cannot add a field to a property another
 * declaration already pins (tsc keeps the shared shape and drops the new
 * field). The `User` interface, by contrast, merges additively, so the
 * session callback bridges the two with a documented `as User` assertion.
 *
 * Scoped to this app only — the shared `packages/auth/types.ts` is untouched
 * (this file merges with it locally, picked up by tsconfig's TS globs).
 */
declare module "next-auth" {
  interface User {
    /** IANA timezone from auth.User.timezone; undefined when unset. */
    timezone?: string;
  }
}
