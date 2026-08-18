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
  // QuikLMS has two deployed origins: `https://quiklms.vercel.app` (Vercel prod)
  // and `https://uatlms.quikit.ai` (UAT). NEITHER is usable out of the box:
  //   - `quiklms.vercel.app` is in NO allow-list, on any branch.
  //   - `uatlms.quikit.ai` was added by commit ec092e52, which is on this feature
  //     branch but on neither `UAT` nor `main`.
  // So the auth + launcher hosts currently serving UAT/prod have NO QuikLMS
  // origin in `DEFAULT_ALLOWED_ORIGINS`, and swallow our callbackUrl no matter
  // what this file sends — the user lands on the QuikIT launcher instead.
  // Fix is `AUTH_ALLOWED_RETURN_ORIGINS` on the auth + quikit deployments (see
  // below); nothing in this app can work around it. A per-deployment host
  // like `quikskill-macck3n1x-rajkumar13.vercel.app` is not, and neither is a
  // bare `quikskill.vercel.app` — signing out from either dumps the user on the
  // QuikIT launcher instead of our own landing page. Anchoring to
  // NEXT_PUBLIC_QUIKLMS_URL makes the destination independent of how the app was
  // reached; window.location.origin stays the local-dev fallback, where
  // localhost IS allow-listed.
  //
  // So this env var MUST be set to an allow-listed origin in every deployed
  // environment or the final hop is silently swallowed. To land on any origin
  // other than uatlms.quikit.ai, that origin has to be added to the two
  // signout-global hosts' `AUTH_ALLOWED_RETURN_ORIGINS` env var (both endpoints
  // merge it into their allow-list) — those files are outside apps/quiklms and
  // are an integration-owner change, not one this app can make.
  const canonical = (process.env.NEXT_PUBLIC_QUIKLMS_URL ?? '').replace(/\/+$/, '');
  const base = canonical || window.location.origin;

  // Land on the public marketing page, NOT `/login`. `/login` immediately
  // re-initiates SSO (`signIn('quikit')` on mount), so sending a just-signed-out
  // user there would log them straight back into quikit-auth and the logout
  // would look broken — this is the "the QuikLMS page flashes for a second then
  // jumps to quikit-auth" report.
  //
  // `?reason=logged_out` is the important part: the landing page redirects ANY
  // authenticated session onward to its dashboard, and the local cookie-clear
  // can still be settling when the browser lands back here after the SLO hops —
  // so a stale session would bounce the user off the landing (→ dashboard →
  // middleware sees the central session is gone → quikit-auth). The flag tells
  // the landing page to HOLD here instead, so the user stays on the QuikLMS
  // landing and clicks Sign in themselves. See app/(marketing)/page.tsx.
  const target = finalRedirect ?? `${base}/?reason=logged_out`;

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
