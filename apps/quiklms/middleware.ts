import { createMiddleware } from '@quikit/auth/middleware';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL;
const QUIKIT_URL = process.env.NEXT_PUBLIC_QUIKIT_URL;
const APP_SLUG = 'quiklms';

/**
 * Extract subdomain from host for multi-tenant branding routing.
 * Returns null for localhost / single-segment hosts.
 *   acme.quikskill.com → 'acme'   |   localhost:3020 → null
 */
function extractSubdomain(host: string): string | null {
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');
  if (parts.length >= 3 && parts[0] !== 'www' && parts[0] !== '') return parts[0];
  return null;
}

// Centralized-auth gate. Unauthenticated users are bounced to the central
// login; no-org / revoked-membership users to the launcher /apps. Remote
// session validation (Redis-backed) runs in production against the central
// /api/verify-token.
//
// AUTHENTICATION ONLY — this middleware answers "are you logged in?", never
// "are you allowed?". Role authorization lives exclusively in the API guards
// (`requireAuth` + `requireRoles` in `lib/auth/context.ts`).
//
// An earlier version of this comment claimed authorization also lived in "the
// route-group layouts". It does not, and never did: all nine layouts
// ((learner), (teacher), (tenant-admin), (sub-admin), (super-admin), (manager),
// (parent), (shared), (fullscreen)) are ~4 lines that render `<AppShell
// role="…">` chrome with no session read and no redirect. Any authenticated
// user can therefore LOAD any dashboard; only the XHRs it fires are refused.
//
// That is survivable today because the API layer holds — every privileged
// endpoint behind those pages 403s correctly (verified in TEST_REPORT.md
// F-001). It stops being survivable the moment a page is built on one of the
// ~90 routes that call `requireAuth` with no `requireRoles`. If you add page-
// level gating later, put it in the layouts and update this comment; do not
// let the comment describe a protection that isn't implemented.
const factory = createMiddleware({
  loginRoute: '/login',
  // `/` is the public marketing landing. It must be reachable signed-out —
  // it is where global sign-out returns the user, and bouncing that redirect
  // straight back into SSO would make logging out impossible. The page itself
  // redirects an authenticated visitor on to their role dashboard.
  publicRoutes: ['/', '/login', '/auth-handoff', '/verify-certificate', '/design'],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
  enforceRemoteSessionValidation: process.env.NODE_ENV === 'production',
});

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const subdomain = extractSubdomain(request.headers.get('host') ?? '');

  // API routes are never auth-gated by middleware (per-route guards handle
  // that). We only forward the tenant subdomain header so public branding
  // endpoints (e.g. /api/tenants/branding/public) can resolve without a session.
  if (pathname.startsWith('/api')) {
    const headers = new Headers(request.headers);
    // ALWAYS write this header — set it to the Host-derived value, or delete it
    // when there is no subdomain. The previous `if (subdomain)` guard left an
    // attacker-supplied `x-tenant-subdomain` intact on apex domains and
    // localhost, where `extractSubdomain` returns null; a caller could then
    // name any tenant and have the public branding endpoint resolve to it.
    // The header is derived state, so it must never survive from the request.
    if (subdomain) headers.set('x-tenant-subdomain', subdomain);
    else headers.delete('x-tenant-subdomain');
    return NextResponse.next({ request: { headers } });
  }

  const res = await factory(request);
  if (subdomain) res.headers.set('x-tenant-subdomain', subdomain);

  // Launcher handoff: cookies don't cross *.vercel.app subdomains, so rewrite
  // the factory's redirect-to-central-login into the launcher, which mints a
  // JWT that /auth-handoff exchanges for this app's session cookie.
  if (QUIKIT_URL && (res.status === 307 || res.status === 308)) {
    const dest = res.headers.get('location') ?? '';
    const launcherLogin = AUTH_URL ? `${AUTH_URL}/login` : '';
    if (launcherLogin && dest.startsWith(launcherLogin)) {
      const handoff = new URL('/apps', QUIKIT_URL);
      handoff.searchParams.set('handoff', APP_SLUG);
      handoff.searchParams.set('to', request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(handoff);
    }
  }

  return res;
}

export const config = {
  // Run on all routes incl. /api (needed to forward x-tenant-subdomain).
  // Static assets / Next internals are excluded.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
