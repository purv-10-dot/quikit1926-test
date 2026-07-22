'use client';
import { signOut } from 'next-auth/react';

/**
 * Single logout across the QuikIT platform.
 *
 * Clearing only this app's cookie is not a logout — the centralized session
 * still exists, so the next page load SSOs the same person straight back in.
 * A real sign-out has to walk the chain:
 *
 *   1. local next-auth cookie (+ browser storage, so no per-user UI state
 *      bleeds into the next session on a shared machine)
 *   2. <auth>/api/auth/signout-global
 *   3. <quikit>/api/auth/signout-global
 *   4. back to `finalRedirect`
 *
 * Extracted from the login page's `handleSwitchAccount`, which implemented this
 * inline. The topbar's Sign out needs the identical chain, and two hand-copied
 * versions of a security-relevant sequence is how one of them ends up only
 * half-clearing. Mirrors `@quikit/ui`'s `globalSignOut` without taking the
 * dependency — quiklms does not depend on `@quikit/ui`.
 */
export async function globalSignOut(finalRedirect?: string): Promise<void> {
  try {
    await signOut({ redirect: false });
  } catch {
    /* never let a local cookie-clear failure block the global sign-out */
  }
  try {
    window.localStorage.clear();
    window.sessionStorage.clear();
  } catch {
    /* storage may be blocked by strict cookie policies — ignore */
  }

  const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL ?? '').replace(/\/+$/, '');
  const quikitUrl = (process.env.NEXT_PUBLIC_QUIKIT_URL ?? '').replace(/\/+$/, '');
  // Land on the public marketing page, not `/login`. `/login` immediately
  // re-initiates SSO (`signIn('quikit')` on mount), so sending a just-signed-out
  // user there would log them straight back in — the logout would look broken.
  // `/` is in `publicRoutes`, so a signed-out visitor sees the landing page.
  const target = finalRedirect ?? `${window.location.origin}/`;

  const launcherSlo = quikitUrl
    ? `${quikitUrl}/api/auth/signout-global?callbackUrl=${encodeURIComponent(target)}`
    : target;
  const chain = authUrl
    ? `${authUrl}/api/auth/signout-global?callbackUrl=${encodeURIComponent(launcherSlo)}`
    : launcherSlo;

  window.location.href = chain;
}
