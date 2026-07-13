import { createMiddleware } from "@quikit/auth/middleware";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * QuikAsset middleware — mirrors the quikscale wrapper exactly.
 *
 *   - `/`            → public marketing landing (the page server-redirects
 *                      authed users to /dashboard).
 *   - `/dashboard`, `/assets`, … → auth required. Unauth users bounce to the
 *                      central auth host's `/login`; no-org users are routed
 *                      through the launcher `/apps?handoff=quikasset` handshake.
 *   - `/auth-handoff` → public so the launcher's cross-domain cookie bridge
 *                      can plant this host's session cookie.
 *
 * Do not roll custom auth here — the shared factory keeps all apps in sync.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikasset";

const factory = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/api/health"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

export async function middleware(request: NextRequest) {
  const res = await factory(request);
  if (!res || (res.status !== 307 && res.status !== 308)) return res;

  const base = publicBaseUrl(request);
  const loc = res.headers.get("location") ?? "";
  let locUrl: URL;
  try {
    locUrl = new URL(loc, base);
  } catch {
    return res;
  }

  // Case 1: same-host redirect to /login* → rewrite to `/` (marketing landing).
  if (
    locUrl.host === new URL(base).host &&
    locUrl.pathname.startsWith("/login")
  ) {
    return NextResponse.redirect(new URL("/", base));
  }

  // Case 2: cross-host central-login bounce with reason=session_expired →
  // clear stale cookies before redirecting so the revoked session can't replay.
  if (AUTH_URL) {
    let authOrigin: string | null = null;
    try { authOrigin = new URL(AUTH_URL).origin; } catch { authOrigin = null; }
    if (
      authOrigin &&
      locUrl.origin === authOrigin &&
      locUrl.searchParams.get("reason") === "session_expired"
    ) {
      return clearSessionCookies(NextResponse.redirect(locUrl));
    }
  }

  // Case 3: cross-host redirect to launcher /apps (no-org user) → rewrite to
  // the launcher handoff handshake so the user lands back on quikasset.
  if (QUIKIT_URL) {
    let launcherOrigin: string | null = null;
    try { launcherOrigin = new URL(QUIKIT_URL).origin; } catch { launcherOrigin = null; }
    if (
      launcherOrigin &&
      locUrl.origin === launcherOrigin &&
      locUrl.pathname === "/apps"
    ) {
      const handoff = new URL("/apps", QUIKIT_URL);
      handoff.searchParams.set("handoff", APP_SLUG);
      handoff.searchParams.set(
        "to",
        request.nextUrl.pathname + request.nextUrl.search,
      );
      return NextResponse.redirect(handoff);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
