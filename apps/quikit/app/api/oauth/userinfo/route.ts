import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/oauth/userinfo — OIDC UserInfo Endpoint
 *
 * Returns claims about the authenticated user. The access_token is
 * passed via the Authorization header as a Bearer token.
 *
 * Looks up the access token in the OAuthRefreshToken table (where it's
 * stored alongside the refresh token during the token exchange).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "invalid_token", error_description: "Missing Bearer token" },
      { status: 401 },
    );
  }

  const accessToken = authHeader.slice(7);

  // Look up the access token → find the user + tenant
  const tokenRecord = await db.oAuthRefreshToken.findFirst({
    where: {
      accessToken,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
    select: { userId: true, tenantId: true, scopes: true },
  });

  if (!tokenRecord) {
    return NextResponse.json(
      { error: "invalid_token", error_description: "Token not found or expired" },
      { status: 401 },
    );
  }

  const user = await db.user.findUnique({
    where: { id: tokenRecord.userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      avatar: true,
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: "invalid_token" },
      { status: 401 },
    );
  }

  const membership = await db.membership.findFirst({
    where: {
      userId: user.id,
      tenantId: tokenRecord.tenantId,
      status: "active",
    },
    select: { role: true },
  });

  return NextResponse.json({
    sub: user.id,
    email: user.email,
    email_verified: true,
    name: `${user.firstName} ${user.lastName}`,
    given_name: user.firstName,
    family_name: user.lastName,
    picture: user.avatar,
    tenant_id: tokenRecord.tenantId,
    role: membership?.role ?? "member",
  });
}
