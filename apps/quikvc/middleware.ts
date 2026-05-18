import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikVC middleware.
 *
 * Wraps the @quikit/auth factory so unauthenticated traffic gets routed
 * through the launcher's hand-off flow (the launcher mints a JWT, then
 * `/auth-handoff` exchanges it for our session cookie on this subdomain).
 *
 * Dev escape hatch: set QUIKVC_DEV_BYPASS=1 in .env.local to skip the
 * middleware entirely — pairs with `lib/dev-session.ts` which falls back
 * to the seeded ValleyNXT tenant when getServerSession returns null.
 */
const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = "quikvc";

const factoryMiddleware = createMiddleware({
  loginRoute: "/login",
  // No local org picker — no-org users are sent to the launcher /apps
  // via centralSelectOrgUrl (cross-domain handoff).
  publicRoutes: ["/login", "/invitations", "/auth-handoff"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});

function isDevBypassEnabled(): boolean {
  const v = (process.env.QUIKVC_DEV_BYPASS ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

async function realMiddleware(request: NextRequest) {
  const res = await factoryMiddleware(request);
  if (QUIKIT_URL && (res.status === 307 || res.status === 308)) {
    const dest = res.headers.get("location") ?? "";
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : "";
    if (launcherLogin && dest.startsWith(launcherLogin)) {
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

export const middleware = isDevBypassEnabled()
  ? function devMiddleware(_req: NextRequest) {
      return NextResponse.next();
    }
  : realMiddleware;

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
