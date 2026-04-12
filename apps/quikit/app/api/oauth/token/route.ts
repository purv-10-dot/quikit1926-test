import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import {
  generateIdToken,
  generateAccessToken,
  generateRefreshToken,
  verifyPKCE,
} from "@/lib/oauth";

/**
 * POST /api/oauth/token — OAuth2 Token Endpoint
 *
 * Exchanges an authorization code for tokens:
 *   - access_token  (opaque)
 *   - id_token      (JWT signed with RSA)
 *   - refresh_token
 *
 * Supports grant_type: "authorization_code" and "refresh_token".
 * Authenticates the client via client_id + client_secret in the body.
 */
export async function POST(request: NextRequest) {
  const body = await request.formData().catch(() => null);
  const params = body
    ? Object.fromEntries(body.entries())
    : await request.json().catch(() => ({}));

  const grantType = String(params.grant_type ?? "");
  const clientId = String(params.client_id ?? "");
  const clientSecret = String(params.client_secret ?? "");

  // Authenticate the client
  const client = await db.oAuthClient.findUnique({
    where: { clientId },
    select: { clientSecret: true, scopes: true },
  });
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client" },
      { status: 401 },
    );
  }

  const secretValid = await bcrypt.compare(clientSecret, client.clientSecret);
  if (!secretValid) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Bad client_secret" },
      { status: 401 },
    );
  }

  if (grantType === "authorization_code") {
    return handleAuthCodeExchange(params, clientId);
  }

  if (grantType === "refresh_token") {
    return handleRefreshToken(params, clientId);
  }

  return NextResponse.json(
    { error: "unsupported_grant_type" },
    { status: 400 },
  );
}

async function handleAuthCodeExchange(
  params: Record<string, unknown>,
  clientId: string,
) {
  const code = String(params.code ?? "");
  const redirectUri = String(params.redirect_uri ?? "");
  const codeVerifier = params.code_verifier
    ? String(params.code_verifier)
    : null;

  // Look up the code
  const authCode = await db.oAuthCode.findUnique({ where: { code } });
  if (!authCode || authCode.clientId !== clientId) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired code" },
      { status: 400 },
    );
  }
  if (authCode.used || authCode.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Code expired or already used" },
      { status: 400 },
    );
  }
  if (authCode.redirectUri !== redirectUri) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "redirect_uri mismatch" },
      { status: 400 },
    );
  }

  // PKCE validation
  if (authCode.codeChallenge) {
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "code_verifier required (PKCE)" },
        { status: 400 },
      );
    }
    if (
      !verifyPKCE(
        codeVerifier,
        authCode.codeChallenge,
        authCode.codeChallengeMethod ?? "S256",
      )
    ) {
      return NextResponse.json(
        { error: "invalid_grant", error_description: "PKCE verification failed" },
        { status: 400 },
      );
    }
  }

  // Mark code as used
  await db.oAuthCode.update({
    where: { id: authCode.id },
    data: { used: true },
  });

  // Fetch user details for the id_token
  const user = await db.user.findUnique({
    where: { id: authCode.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "server_error", error_description: "User not found" },
      { status: 500 },
    );
  }

  // Fetch membership role
  const membership = await db.membership.findFirst({
    where: {
      userId: authCode.userId,
      tenantId: authCode.tenantId,
      status: "active",
    },
    select: { role: true },
  });

  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const idToken = await generateIdToken(
    {
      sub: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      tenant_id: authCode.tenantId,
      role: membership?.role ?? "member",
    },
    clientId,
  );

  // Store refresh token + access token for userinfo lookup
  await db.oAuthRefreshToken.create({
    data: {
      token: refreshToken,
      accessToken,
      clientId,
      userId: authCode.userId,
      tenantId: authCode.tenantId,
      scopes: authCode.scopes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
  });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    id_token: idToken,
    scope: authCode.scopes.join(" "),
  });
}

async function handleRefreshToken(
  params: Record<string, unknown>,
  clientId: string,
) {
  const token = String(params.refresh_token ?? "");

  const stored = await db.oAuthRefreshToken.findUnique({
    where: { token },
  });
  if (
    !stored ||
    stored.clientId !== clientId ||
    stored.revoked ||
    stored.expiresAt < new Date()
  ) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: "Invalid or expired refresh token" },
      { status: 400 },
    );
  }

  // Rotate: revoke old token, issue new one
  await db.oAuthRefreshToken.update({
    where: { id: stored.id },
    data: { revoked: true },
  });

  const user = await db.user.findUnique({
    where: { id: stored.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }

  const membership = await db.membership.findFirst({
    where: {
      userId: stored.userId,
      tenantId: stored.tenantId,
      status: "active",
    },
    select: { role: true },
  });

  const newAccessToken = generateAccessToken();
  const newRefreshToken = generateRefreshToken();
  const idToken = await generateIdToken(
    {
      sub: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      tenant_id: stored.tenantId,
      role: membership?.role ?? "member",
    },
    clientId,
  );

  await db.oAuthRefreshToken.create({
    data: {
      token: newRefreshToken,
      accessToken: newAccessToken,
      clientId,
      userId: stored.userId,
      tenantId: stored.tenantId,
      scopes: stored.scopes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  return NextResponse.json({
    access_token: newAccessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: newRefreshToken,
    id_token: idToken,
    scope: stored.scopes.join(" "),
  });
}
