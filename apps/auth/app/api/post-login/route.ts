import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/lib/auth";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { clearSessionCookies } from "@quikit/auth/session-cookies";
import {
  allowedTargetOrigins,
  mintHandoffToken,
  resolveOrgContext,
} from "@quikit/auth/mobile";

/**
 * GET /api/post-login?callbackUrl=<absolute-url>
 *
 * The cross-domain session bridge. NextAuth credentials sign-in sets the
 * session cookie on `auth-quikit.vercel.app` only (host-only, no domain).
 * Sub-apps live on different hosts (`quikscale.vercel.app`,
 * `quik-it-auth.vercel.app`, …) and need their OWN per-host cookies.
 *
 * Flow:
 *   1. Sign-in completes on the auth app → cookie set on this host.
 *   2. NextAuth `redirect` callback routes the user to this endpoint with
 *      the original `callbackUrl` as a query param.
 *   3. We read the session, mint a short-lived HS256 token signed with
 *      `INTERNAL_SECRET` (the same secret every sub-app's `/auth-handoff`
 *      verifies with), and redirect to
 *      `${targetOrigin}/auth-handoff?token=<jwt>`.
 *   4. The target app's `/auth-handoff` exchanges the token for a
 *      NextAuth-compatible session cookie scoped to its own host, then
 *      redirects to the original path (carried in the JWT's `to` claim).
 *
 * Allow-list: only `callbackUrl` origins matching the auth `redirect`
 * callback's allow-list are honoured. Unknown origins fall back to the
 * launcher `/apps` page.
 *
 * Token TTL is 120s — enough for the browser to follow the redirect and
 * the target host's handoff route to verify, never long enough to ride
 * around in a clipboard.
 */

function launcherFallback(): string {
  const launcherUrl =
    process.env.NEXT_PUBLIC_QUIKIT_URL ??
    process.env.QUIKIT_URL ??
    "https://quik-it-auth.vercel.app";
  return `${launcherUrl.replace(/\/$/, "")}/apps`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // No session — bounce back to the auth app's login page. Build the URL from
    // the auth app's own public origin (NEXTAUTH_URL / forwarded host), never
    // `request.url`, which resolves to the pod bind address (0.0.0.0:3001) when
    // the ingress doesn't preserve the Host header. Also evict any stale-but-
    // cryptographically-valid session cookie so the browser stops replaying it
    // (otherwise the user must manually clear cookies to recover).
    const redirect = NextResponse.redirect(
      new URL("/login?reason=no_session", publicBaseUrl(request)),
    );
    return clearSessionCookies(redirect);
  }

  const internalSecret = process.env.INTERNAL_SECRET;
  if (!internalSecret) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured (INTERNAL_SECRET missing)" },
      { status: 500 },
    );
  }

  // Parse + validate the callbackUrl.
  const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
  let target: URL;
  try {
    target = new URL(callbackUrl ?? "");
  } catch {
    return NextResponse.redirect(launcherFallback());
  }

  if (!allowedTargetOrigins().has(target.origin)) {
    return NextResponse.redirect(launcherFallback());
  }

  // Pull user identity + org membership so the token carries everything
  // the target host's session shape expects (email, name, orgId, role).
  const userId = session.user.id;
  const sessionOrgId = session.user.orgId;
  const isSuperAdmin = Boolean(session.user.isSuperAdmin);

  // The session callback doesn't surface the Redis session id — read it off
  // the raw JWT so the handoff token carries the shared session id into the
  // target app (lets it be soft-invalidated from the shared session store).
  const jwt = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const sessionId = (jwt?.sessionId as string | undefined) ?? null;

  // Resolve org/role/name. Falls back to the user's first active
  // membership so the target app's middleware doesn't bounce them to the
  // launcher's org-picker — the launcher's /apps page is the canonical
  // picker; sub-apps inherit a working org. Shared with the native mobile
  // sign-in endpoint (packages/auth/mobile.ts).
  const orgContext = await resolveOrgContext({
    userId,
    knownOrgId: sessionOrgId ?? null,
    knownMembershipRole:
      (session.user.membershipRole as string | undefined) ?? null,
    knownEmail: session.user.email ?? null,
  });

  // Mint the handoff token. `to` carries the path the user originally
  // wanted on the target host (so /auth-handoff lands them there after
  // setting the cookie).
  const to = `${target.pathname}${target.search}` || "/";
  const token = await mintHandoffToken(internalSecret, {
    userId,
    orgId: orgContext.orgId,
    isSuperAdmin,
    membershipRole: orgContext.membershipRole,
    email: orgContext.email,
    firstName: orgContext.firstName,
    lastName: orgContext.lastName,
    name: orgContext.name,
    sessionId,
    to,
  });

  const handoff = new URL("/auth-handoff", target.origin);
  handoff.searchParams.set("token", token);
  return NextResponse.redirect(handoff);
}
