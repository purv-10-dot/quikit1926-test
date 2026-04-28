import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddleware } from "@quikit/auth/middleware";

/**
 * QuikVC middleware.
 *
 * Production: SSO via @quikit/auth. tenantId comes from the QuikIT OAuth token.
 *
 * Dev (non-production): no-op. Lets you click through every screen without
 * a real session — pairs with `lib/dev-session.ts` which falls back to the
 * seeded ValleyNXT tenant when getServerSession returns null.
 *
 *   ⚠ Sprint 2 only. Sprint 5 removes the dev bypass before production cutover.
 */
const realMiddleware = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/login", "/select-org", "/invitations"],
});

const isProd = process.env.NODE_ENV === "production";

export const middleware = isProd
  ? realMiddleware
  : function devMiddleware(_req: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
