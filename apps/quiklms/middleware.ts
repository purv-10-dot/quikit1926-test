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
// /api/verify-token. Per-route/role authorization lives in the API guards
// (requireRoles) and route-group layouts — NOT here (platform convention).
const factory = createMiddleware({
  loginRoute: '/login',
  publicRoutes: ['/login', '/auth-handoff', '/verify-certificate', '/design'],
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
    if (subdomain) headers.set('x-tenant-subdomain', subdomain);
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
