import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { encode, getToken } from "next-auth/jwt";
import { getAppAccess } from "@quikit/auth/app-access";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { db } from "@/lib/db";
import { safeInternalPath } from "@/lib/utils/safe-redirect";

const APP_SLUG = "quiktrack";

// Reads the session cookie and re-mints it — never cache or prerender.
export const dynamic = "force-dynamic";

/**
 * GET /api/session/switch-org?orgId=<id>&to=<internal path>
 *
 * Moves this app's session onto another org the caller is a member of, then
 * redirects to `to`.
 *
 * Why it exists: a QuikTrack session carries exactly ONE active org (the JWT
 * `orgId` claim, planted by the launcher hand-off). A user who belongs to two
 * orgs and gets an emailed work-item link — `/browse/TRACK-1?org=<orgId>` —
 * clicks it with whatever org they last opened the app in. If that isn't the
 * org the work item lives in, the org-scoped lookup finds nothing and the page
 * 404s ("Something went wrong"). Middleware spots the `?org=` mismatch and
 * sends the request here first, so the deep link lands on the right workspace.
 *
 * A server component can't set cookies, which is why this is a route handler
 * and not inline in the page. Same cookie contract as /auth-handoff.
 *
 * Guards (a failed switch never mutates the session — it just forwards to `to`
 * on the current org, where the page's own org-scoped lookup takes over):
 *   - unauthenticated            → /login?callbackUrl=<to>
 *   - no active membership, or a suspended org → forward without switching
 *   - no QuikTrack access in the target org    → landing page + access popup
 */
export async function GET(request: NextRequest) {
  // This app's own public origin — never `request.url` (that resolves to the
  // pod bind address when the ingress doesn't preserve Host). The session
  // cookie is host-only, so the redirect must stay on the serving host.
  const origin = publicBaseUrl(request);
  const orgId = request.nextUrl.searchParams.get("orgId");

  // Strip `org` from the destination: middleware would otherwise read it again
  // on the way back and bounce straight into this route (a redirect loop when
  // the switch is refused).
  const rawTo = safeInternalPath(request.nextUrl.searchParams.get("to"), "/dashboard");
  const toUrl = new URL(rawTo, origin);
  toUrl.searchParams.delete("org");
  const to = `${toUrl.pathname}${toUrl.search}`;

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ success: false, error: "Server misconfigured" }, { status: 500 });
  }

  const token = await getToken({ req: request, secret });
  const userId = (token?.id ?? token?.sub) as string | undefined;
  if (!userId) {
    const login = new URL("/login", origin);
    login.searchParams.set("callbackUrl", to);
    return NextResponse.redirect(login);
  }

  // Nothing to do: no target, or the session is already on it.
  if (!orgId || orgId === token?.orgId) {
    return NextResponse.redirect(new URL(to, origin));
  }

  // The org must be one the caller actually belongs to, and it must be live —
  // a suspended org can't be selected even by an active member (same rule as
  // @quikit/auth's createOrgSelectHandler).
  const membership = await db.orgMember.findFirst({
    where: { userId, orgId, status: "active", org: { status: "active" } },
    select: { role: true },
  });
  if (!membership) {
    return NextResponse.redirect(new URL(to, origin));
  }

  // Entitlement in the TARGET org, checked before we touch the cookie: parking
  // the session on an org where QuikTrack isn't granted would just get bounced
  // by the dashboard layout on the next navigation.
  const { hasAccess, otherAppsCount } = await getAppAccess({
    userId,
    orgId,
    appSlug: APP_SLUG,
    isSuperAdmin: token?.isSuperAdmin === true,
    memberRole: membership.role,
  });
  if (!hasAccess) {
    const denied = new URL("/", origin);
    denied.searchParams.set("reason", "no_app_access");
    denied.searchParams.set("others", String(otherAppsCount));
    const home = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
    if (home) denied.searchParams.set("home", home.replace(/\/+$/, ""));
    return NextResponse.redirect(denied);
  }

  // Re-mint the same session with the new org. Spreading `token` keeps every
  // other claim (sub/id, sessionId, profile fields) intact, so the shared
  // Redis session and the central /api/verify-token check still recognise it.
  const sessionToken = await encode({
    token: {
      ...token,
      orgId,
      membershipRole: membership.role,
      membershipCheckedAt: Date.now(),
    },
    secret,
    maxAge: 7 * 24 * 60 * 60,
  });

  const response = NextResponse.redirect(new URL(to, origin));
  const cookieName =
    process.env.NODE_ENV === "production"
      ? "__Secure-next-auth.session-token"
      : "next-auth.session-token";
  response.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days — matches /auth-handoff
    // No `domain` — host-only, like every other session cookie this app sets.
  });
  return response;
}
