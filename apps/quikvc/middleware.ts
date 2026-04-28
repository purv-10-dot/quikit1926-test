import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikVC middleware.
 *
 * SSO via @quikit/auth — tenantId comes from the QuikIT OAuth token.
 * Unauthenticated users are bounced to /login which auto-triggers signIn("quikit").
 *
 * Dev escape hatch: set QUIKVC_DEV_BYPASS=1 in .env.local to skip the
 * middleware entirely — pairs with `lib/dev-session.ts` which falls back to
 * the seeded ValleyNXT tenant when getServerSession returns null. Strictly
 * opt-in (was previously enabled for any non-production env, which is too
 * loose for preview / staging deployments).
 */
const realMiddleware = createMiddleware({
  loginRoute: "/login",
  selectOrgRoute: "/select-org",
  publicRoutes: ["/login", "/select-org", "/invitations"],
});

function isDevBypassEnabled(): boolean {
  const v = (process.env.QUIKVC_DEV_BYPASS ?? "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes";
}

export const middleware = isDevBypassEnabled()
  ? function devMiddleware(_req: NextRequest) {
      return NextResponse.next();
    }
  : realMiddleware;

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
