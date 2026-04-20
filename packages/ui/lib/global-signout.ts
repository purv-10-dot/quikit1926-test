/**
 * Single-Logout (SLO) helper.
 *
 * Standard NextAuth `signOut()` only clears the current app's cookie — the
 * user remains signed in to QuikIT (the IdP) and any other app they're
 * still authenticated to. Clicking sign-in right after would auto-re-auth.
 *
 * `globalSignOut` fixes that:
 *   1. Clears this app's cookie via the provided `localSignOut` callback
 *      (typically NextAuth's `signOut({ redirect: false })`).
 *   2. Redirects the browser to QuikIT's `/api/auth/signout-global`
 *      endpoint, which clears the IdP cookie + redirects to login.
 *
 * Net effect: one click, fully logged out everywhere. After login they
 * land back at the app they started from (if configured).
 *
 * Usage (from a relying-party app like quikscale or admin):
 *
 *   import { signOut } from "next-auth/react";
 *   import { globalSignOut } from "@quikit/ui";
 *
 *   await globalSignOut({
 *     quikitUrl: process.env.NEXT_PUBLIC_QUIKIT_URL,
 *     localSignOut: () => signOut({ redirect: false }),
 *     postLogoutRedirect: "/login",
 *   });
 *
 * On QuikIT itself (where there's no remote IdP), pass `quikitUrl = window.location.origin`
 * (or omit and let the helper default to it).
 */

export interface GlobalSignOutOptions {
  /**
   * Origin of the QuikIT IdP (e.g. "https://quik-it-auth.vercel.app").
   * Omit on QuikIT itself — will default to `window.location.origin`.
   */
  quikitUrl?: string;
  /**
   * Clears the current app's session cookie. Typically
   * `() => signOut({ redirect: false })` from next-auth/react.
   */
  localSignOut: () => Promise<unknown> | unknown;
  /**
   * Where to land after the global sign-out completes.
   * Defaults to `<quikitUrl>/login`.
   */
  postLogoutRedirect?: string;
}

export async function globalSignOut(options: GlobalSignOutOptions): Promise<void> {
  const { quikitUrl, localSignOut, postLogoutRedirect } = options;

  // 1) Clear local app cookie first so there's no race if navigation is slow.
  try {
    await localSignOut();
  } catch {
    // Never let local cookie-clear failure block the global sign-out.
  }

  if (typeof window === "undefined") return;

  const idp = (quikitUrl && quikitUrl.trim()) || window.location.origin;
  const redirect = postLogoutRedirect || `${idp.replace(/\/+$/, "")}/login`;
  const target = `${idp.replace(/\/+$/, "")}/api/auth/signout-global?callbackUrl=${encodeURIComponent(redirect)}`;

  // 2) Navigate. Use location.href (full page load) so all in-memory app
  // state + React Query cache + module caches are cleared too.
  window.location.href = target;
}
