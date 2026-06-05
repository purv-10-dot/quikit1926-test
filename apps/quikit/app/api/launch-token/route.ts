import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { SignJWT } from "jose";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/launch-token
 *
 * Mints a short-lived HS256 JWT used to hand the user off from the launcher
 * to a consumer app on a different `.vercel.app` subdomain. Because cookies
 * cannot be shared across distinct subdomains on the public-suffix list,
 * the consumer app uses this token (carried in the URL) to mint its OWN
 * session cookie on its own domain.
 *
 * Payload:
 *   { userId, orgId, appId, slug }
 *
 * TTL: 120 seconds (covers clock skew across Vercel edge regions).
 * Signed with INTERNAL_SECRET (shared across all apps).
 *
 * Caller (launcher tile click) sends `{ appSlug, orgId?, to? }` in the
 * request body. `orgId` defaults to the session's selected org; `to` is
 * forwarded verbatim to the consumer's handoff endpoint so deep-links
 * survive the round-trip.
 *
 * Authorization:
 *   - Caller must have an active OrgMember row in the selected org.
 *   - Caller must have UserAppAccess for (orgId, appId) OR be the org
 *     admin OR be a platform super-admin (mirrors the launcher's tile
 *     visibility rules).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const userId = session.user.id;
  const sessionOrgId = session.user.orgId;
  const isSuperAdmin = Boolean(session.user.isSuperAdmin);

  let body: { appSlug?: string; orgId?: string; to?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const appSlug = (body.appSlug ?? "").trim();
  const orgId = (body.orgId ?? sessionOrgId ?? "").trim();
  const to = typeof body.to === "string" ? body.to : "/";

  if (!appSlug) {
    return NextResponse.json(
      { success: false, error: "appSlug required" },
      { status: 400 },
    );
  }

  // Validate the requested app exists + is active.
  const app = await db.app.findUnique({
    where: { slug: appSlug },
    select: { id: true, slug: true, status: true, requiresOrgAdmin: true },
  });
  if (!app || app.status === "disabled") {
    return NextResponse.json(
      { success: false, error: "Unknown or disabled app" },
      { status: 404 },
    );
  }

  // Super admins bypass org/access checks (they can land on any app to
  // bootstrap configuration). Everyone else needs an explicit grant.
  if (!isSuperAdmin) {
    if (!orgId) {
      return NextResponse.json(
        { success: false, error: "No organisation selected" },
        { status: 400 },
      );
    }

    // Must be an active member of the org.
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    if (!member) {
      return NextResponse.json(
        { success: false, error: "Not a member of this organisation" },
        { status: 403 },
      );
    }

    // Org must have the app enabled.
    const orgAllow = await db.orgAppAccess.findFirst({
      where: { orgId, appId: app.id, enabled: true },
      select: { appId: true },
    });
    if (!orgAllow) {
      return NextResponse.json(
        { success: false, error: "App not enabled for this org" },
        { status: 403 },
      );
    }

    // Admin-tier apps gate by membership role.
    const ADMIN_ROLES = new Set(["org_admin", "admin", "super_admin"]);
    if (app.requiresOrgAdmin && !ADMIN_ROLES.has(member.role)) {
      return NextResponse.json(
        { success: false, error: "Org admin role required for this app" },
        { status: 403 },
      );
    }

    // For non-admin apps, require explicit UserAppAccess unless the user
    // is org admin (org admins see every provisioned app by default).
    if (!app.requiresOrgAdmin && !ADMIN_ROLES.has(member.role)) {
      const userAccess = await db.userAppAccess.findFirst({
        where: { userId, orgId, appId: app.id },
        select: { role: true },
      });
      if (!userAccess) {
        return NextResponse.json(
          { success: false, error: "No access to this app" },
          { status: 403 },
        );
      }
    }
  }

  const secret = process.env.INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured (INTERNAL_SECRET missing)" },
      { status: 500 },
    );
  }

  // Resolve membership role for this (user, org) so the target app's
  // middleware can perform requireAdmin / role gating without needing
  // its own DB lookup before the page renders.
  let membershipRole: string | null = null;
  if (orgId) {
    const member = await db.orgMember.findFirst({
      where: { userId, orgId, status: "active" },
      select: { role: true },
    });
    membershipRole = member?.role ?? null;
  }

  // Pull user profile fields. Consumer apps' session.user expects email +
  // name to be populated (their middlewares + APIs read these). Without
  // them, the app's first authenticated request fails the user-shape check
  // and signs the user out, sending us back into the OAuth flow.
  const userRow = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true },
  });
  const email = userRow?.email ?? session.user.email ?? null;
  const firstName = userRow?.firstName ?? null;
  const lastName = userRow?.lastName ?? null;
  const name =
    firstName || lastName ? `${firstName ?? ""} ${lastName ?? ""}`.trim() : null;

  // The session callback doesn't surface the Redis session id, so read it
  // off the raw JWT. Carrying it into the handoff token lets the consumer
  // app's auth-handoff endpoint stamp it onto the minted NextAuth cookie,
  // so the consumer cookie shares the central session id and remote
  // verify-token / the jwt-callback Redis check can soft-invalidate it.
  // Without this, launcher-entered consumer sessions carry no sessionId
  // and revocation is silently a no-op for them.
  const jwt = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const sessionId = (jwt?.sessionId as string | undefined) ?? null;

  const key = new TextEncoder().encode(secret);
  const jti = crypto.randomUUID();
  const token = await new SignJWT({
    sub: userId,
    orgId: orgId || null,
    appId: app.id,
    slug: app.slug,
    to,
    isSuperAdmin,
    membershipRole,
    email,
    firstName,
    lastName,
    name,
    sessionId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("120s")
    .setJti(jti)
    .sign(key);

  return NextResponse.json({ success: true, data: { token } });
}
