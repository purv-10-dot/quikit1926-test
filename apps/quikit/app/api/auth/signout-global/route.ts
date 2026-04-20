/**
 * Single-Logout (SLO) endpoint — clears the QuikIT IdP session cookie and
 * redirects to the login page. Invoked by relying-party apps (quikscale,
 * admin) as the last hop in their sign-out flow.
 *
 * Flow (global sign-out from quikscale, for example):
 *   1. User clicks "Sign out" in quikscale UserMenu.
 *   2. quikscale calls `signOut({ redirect: false })` — clears quikscale cookie.
 *   3. quikscale navigates browser to:
 *        https://quik-it-auth.vercel.app/api/auth/signout-global?callbackUrl=https://quik-it-auth.vercel.app/login
 *   4. We clear every NextAuth-issued cookie on the quikit origin and
 *      redirect to the callbackUrl.
 *
 * Why a GET (not POST): the browser arrives here via navigation from the
 * relying-party app. NextAuth's built-in /api/auth/signout is a POST with
 * CSRF — fine for in-app forms but awkward for cross-app redirects. A GET
 * endpoint that only clears our own cookies is safe because:
 *   • cookies are cleared on the same origin as the request.
 *   • no user data is mutated — purely a cookie reset.
 *   • callbackUrl is restricted to same-origin below to prevent open-redirect.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// NextAuth cookies. Names differ between HTTPS (__Secure- / __Host- prefixed)
// and HTTP (plain). We clear both to cover dev + prod.
const NEXT_AUTH_COOKIES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  "next-auth.pkce.code_verifier",
  "__Secure-next-auth.pkce.code_verifier",
  "next-auth.state",
  "__Secure-next-auth.state",
];

function resolveRedirect(req: NextRequest): URL {
  const raw = req.nextUrl.searchParams.get("callbackUrl");
  const fallback = new URL("/login", req.nextUrl.origin);
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, req.nextUrl.origin);
    // Restrict to same-origin to prevent open-redirect abuse.
    if (parsed.origin === req.nextUrl.origin) return parsed;
  } catch {
    // Malformed URL — fall through to fallback.
  }
  return fallback;
}

export async function GET(req: NextRequest) {
  const redirectTo = resolveRedirect(req);
  const response = NextResponse.redirect(redirectTo);

  for (const name of NEXT_AUTH_COOKIES) {
    response.cookies.set({
      name,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }

  return response;
}

// Also support POST for clients that prefer a non-idempotent verb.
export const POST = GET;
