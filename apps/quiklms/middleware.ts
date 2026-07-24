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
// "are you allowed?".
//
// Role authorization is enforced in TWO places, and both are live:
//   1. API guards — `requireAuth` + `requireRoles` (`lib/auth/context.ts`).
//   2. Route-group layouts — each of the seven role groups ((learner),
//      (teacher), (tenant-admin), (sub-admin), (super-admin), (manager),
//      (parent)) calls `requirePageRoles([...])` from `lib/auth/page-guard.ts`,
//      which resolves the role with `resolveLmsRole` — the SAME resolver the
//      API guards use, so page and route gating cannot drift. A refused user is
//      redirected to their own landing page. (This closed TEST_REPORT.md F-001,
//      where the layouts were chrome-only and any authenticated user could LOAD
//      any dashboard.)
//
// (shared) and (fullscreen) intentionally stay auth-only (multi-role by
// design); the data they render is still scoped by the API guards.
//
// Keep this comment truthful: if page-level gating is ever removed, say so here
// rather than letting the comment describe a protection that isn't implemented.
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
