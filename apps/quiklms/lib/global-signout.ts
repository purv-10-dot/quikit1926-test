'use client';
import { signOut } from 'next-auth/react';
import { globalSignOut as sharedGlobalSignOut } from '@quikit/ui/global-signout';

/**
 * Single logout across the QuikIT platform.
 *
 * This is now a thin ADAPTER over `@quikit/ui`'s `globalSignOut`, not a second
 * implementation of it. It previously hand-rolled the entire chain — local
 * `signOut()`, storage wipe, then a manually assembled
 * `<auth>/api/auth/signout-global?callbackUrl=<launcher>/api/auth/signout-global?callbackUrl=<final>`
 * URL. Two hand-copied versions of a security-relevant sequence is how one of
 * them ends up only half-clearing.
 *
 * The fork gave two honest reasons, and both are now resolved:
 *
 *  1. "`@quikit/ui` has no subpath export for this helper, so importing it drags
 *     in tiptap/framer-motion/canvas-confetti for a 40-line function." — fixed
 *     upstream: `@quikit/ui/global-signout` is now an explicit subpath export,
 *     so this imports the 40-line module and nothing else. No barrel.
 *
 *  2. "When `NEXT_PUBLIC_QUIKIT_URL` is absent the shared version falls back to
 *     `window.location.origin` and still attempts a launcher hop — which on
 *     quiklms hits `/api/auth/signout-global`, a route this app does not have,
 *     and 404s mid sign-out." — still true of the shared helper, and still
 *     handled here. See the branch below. That fallback is only sensible ON the
 *     launcher (its own doc says so); every other consumer passes `quikitUrl`
 *     explicitly, so this is a footgun rather than a behaviour anyone relies on.
 *
 * The local `(finalRedirect?)` signature is unchanged, so the two call sites —
 * `components/AppShell.tsx` and `app/login/page.tsx` — need no edit.
 */
export async function globalSignOut(finalRedirect?: string): Promise<void> {
  // The final hop MUST be this app's CANONICAL origin, not wherever the browser
  // happens to be. Both signout-global endpoints validate `callbackUrl` against
  // an allow-list and silently fall back to their OWN root when it does not
  // match — that is what stops them being open redirectors.
  // `quikskill.vercel.app` is on that list; a per-deployment host like
  // `quikskill-macck3n1x-rajkumar13.vercel.app` is not. So signing out from a
  // deployment URL used to dump the user on the QuikIT launcher instead of our
  // own landing page. Anchoring to NEXT_PUBLIC_QUIKLMS_URL makes the
  // destination independent of how the app was reached; window.location.origin
  // stays the local-dev fallback, where localhost IS allow-listed.
  const canonical = (process.env.NEXT_PUBLIC_QUIKLMS_URL ?? '').replace(/\/+$/, '');
  const base = canonical || window.location.origin;

  // Land on the public marketing page, not `/login`. `/login` immediately
  // re-initiates SSO (`signIn('quikit')` on mount), so sending a just-signed-out
  // user there would log them straight back in and the logout would look broken.
  // `/` is in `publicRoutes`, so a signed-out visitor sees the landing page.
  const target = finalRedirect ?? `${base}/`;

  const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').trim();
  const quikitUrl = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? '').trim();

  // Neither central host configured (local bring-up): there is no SLO chain to
  // walk. Clear what we own and go. Delegating here would make the shared
  // helper aim a launcher hop at THIS app and 404.
  if (!authUrl && !quikitUrl) {
    try {
      await signOut({ redirect: false });
    } catch {
      /* never let a local cookie-clear failure block the sign-out */
    }
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      /* storage may be blocked by strict cookie policies — ignore */
    }
    window.location.href = target;
    return;
  }

  await sharedGlobalSignOut({
    // When the launcher is unconfigured we collapse the chain onto the auth
    // host — passing it as `quikitUrl` so it becomes the single terminal hop —
    // rather than letting the shared default point a launcher hop at this app.
    // Both hosts expose the same `/api/auth/signout-global` endpoint, so the
    // shape is identical; only the number of hops differs.
    authUrl: quikitUrl ? authUrl || undefined : undefined,
    quikitUrl: quikitUrl || authUrl,
    localSignOut: () => signOut({ redirect: false }),
    postLogoutRedirect: target,
  });
}
