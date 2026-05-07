import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Roles allowed to reach /settings/* (user management, workflows, roles).
 * Mirrors the wildcard / SETTINGS_USERS+SETTINGS_WORKFLOWS grants in
 * src/lib/rbac/roles.ts — kept as a literal Set here because middleware
 * runs in the Edge runtime and can't import the full RBAC module.
 */
const SETTINGS_ADMIN_ROLES = new Set([
  "platform_super_admin",
  "tenant_admin",
  "company_admin",
]);

/**
 * Every request gets a correlation ID:
 *   - honored from `x-request-id` / `x-correlation-id` if the caller supplied one
 *     (load balancer, upstream service, browser interceptor)
 *   - otherwise generated as `req_<22-char-urlsafe-random>`
 *
 * The id is forwarded to the route handler via request headers, echoed back
 * on the response, and read by:
 *   - `logger` (attaches to every log line as `requestId`)
 *   - response envelopes (`ok`, `err` add `requestId` field)
 *   - audit log rows (stored alongside entityId for cross-system tracing)
 *
 * Generated in middleware so EVERY request (API + page) gets one, even
 * before route handlers run.
 */
function generateRequestId(): string {
  // Web Crypto is available in the Edge runtime middleware context.
  // Build the base64 string without spreading a Uint8Array (avoids the
  // target-es5 downlevel-iteration warning the older tsconfig enforces).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  let b64 = btoa(bin);
  b64 = b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `req_${b64}`;
}

export async function middleware(request: NextRequest) {
  // ── Request ID / correlation ID ──────────────────────────────────
  const incoming =
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    null;
  const requestId = incoming ?? generateRequestId();

  // Attach to the forwarded request so route handlers can read it via
  // `headers().get("x-request-id")`.
  const forwarded = new Headers(request.headers);
  forwarded.set("x-request-id", requestId);

  // ── API routes: pass through with headers only (no auth redirect) ─
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const res = NextResponse.next({ request: { headers: forwarded } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // ── Page routes: NextAuth gate + role-based authorisation ────────
  const { pathname } = request.nextUrl;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // Public paths that don't require a session. `/invite/[token]` is the
  // landing page from invitation emails — must be reachable while logged
  // out so the new user can set their password.
  const isLogin = pathname.startsWith("/login");
  const isInvite = pathname.startsWith("/invite");
  const isPublic = isLogin || isInvite;

  if (!token && !isPublic && !request.nextUrl.searchParams.get("preview")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("callbackUrl", pathname);
    const res = NextResponse.redirect(url);
    res.headers.set("x-request-id", requestId);
    return res;
  }
  // Authenticated users hitting /login normally get bounced to /dashboard.
  // Exception: invitation links arrive as `/login?email=<invitee>` — the
  // recipient may already be signed in as a *different* user (or the same
  // user across tabs), and we must let them reach the form to sign in with
  // the new credentials. The login page reads `?email=` to switch into
  // invite mode and prefill the field.
  const hasInviteEmail = request.nextUrl.searchParams.has("email");
  if (token && isLogin && !hasInviteEmail) {
    const res = NextResponse.redirect(new URL("/dashboard", request.url));
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Forced password reset. `mustChangePassword` flows from CnUser.mustChangePassword
  // (default `true` on every freshly-invited row) through the JWT callback
  // in src/lib/auth/next-auth-options.ts. Until the user submits the reset
  // form (Phase 6), every navigation is funnelled to /reset-password.
  if (
    token &&
    (token as { mustChangePassword?: boolean }).mustChangePassword === true &&
    pathname !== "/reset-password"
  ) {
    const res = NextResponse.redirect(new URL("/reset-password", request.url));
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // Role gate moved out of middleware: SSO-issued JWTs from QuikIT central
  // don't carry our app-specific `roleKey` (it's set on the local `User`
  // row, not in the shared JWT). Edge runtime can't query Postgres, so the
  // settings role check happens in a server-component layout — see
  // `app/(dashboard)/settings/layout.tsx`. Middleware here only enforces
  // "must be authenticated"; the layout enforces "must be admin".

  const res = NextResponse.next({ request: { headers: forwarded } });
  res.headers.set("x-request-id", requestId);
  return res;
}

// Matcher now covers API routes too (for the request-id header), but
// SKIPS static assets, Next internals, and the public login page.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
