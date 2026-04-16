import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateAuthCode } from "@/lib/oauth";

// Reads runtime session + env-backed OAuth keys — never prerender.
export const dynamic = "force-dynamic";

/**
 * GET /api/oauth/authorize — OAuth2 Authorization Endpoint
 *
 * Validates the client, checks user session, generates an auth code,
 * and redirects back to the client's redirect_uri with the code.
 *
 * Query params:
 *   client_id     — registered OAuth client ID (e.g., "quikscale")
 *   redirect_uri  — must match one of the client's registered URIs
 *   response_type — must be "code"
 *   scope         — space-separated scopes (e.g., "openid profile email tenant")
 *   state         — CSRF protection token (passed through unchanged)
 *   code_challenge — PKCE challenge (optional but recommended)
 *   code_challenge_method — "S256" (optional)
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const responseType = params.get("response_type");
  const scope = params.get("scope") ?? "openid";
  const state = params.get("state");
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method") ?? "S256";

  // Validate required params
  if (!clientId || !redirectUri || responseType !== "code") {
    return NextResponse.json(
      { error: "invalid_request", error_description: "Missing or invalid client_id, redirect_uri, or response_type" },
      { status: 400 },
    );
  }

  // Look up the OAuth client
  const client = await db.oAuthClient.findUnique({
    where: { clientId },
    select: { redirectUris: true, scopes: true },
  });
  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "Unknown client_id" },
      { status: 400 },
    );
  }

  // Validate redirect_uri against registered URIs
  if (!client.redirectUris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri not registered for this client" },
      { status: 400 },
    );
  }

  // Check user session (must be logged in)
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // Redirect to login, then back here after login
    const currentUrl = request.nextUrl.toString();
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${encodeURIComponent(currentUrl)}`, request.nextUrl.origin),
    );
  }

  const userId = session.user.id;
  let tenantId = session.user.tenantId;

  if (!tenantId) {
    // User hasn't selected an org yet — try to auto-select their first membership
    const membership = await db.membership.findFirst({
      where: { userId, status: "active" },
      select: { tenantId: true, role: true },
      orderBy: { createdAt: "asc" },
    });
    if (membership) {
      tenantId = membership.tenantId;
    } else {
      // No membership at all → redirect to app launcher
      const currentUrl = request.nextUrl.toString();
      return NextResponse.redirect(
        new URL(`/apps?callbackUrl=${encodeURIComponent(currentUrl)}`, request.nextUrl.origin),
      );
    }
  }

  // Verify user has access to this app
  const app = await db.app.findFirst({
    where: { oauthClient: { clientId } },
    select: { id: true },
  });
  if (app) {
    const access = await db.userAppAccess.findFirst({
      where: { userId, tenantId, appId: app.id },
    });
    if (!access) {
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set("error", "access_denied");
      errorUrl.searchParams.set("error_description", "User does not have access to this app");
      if (state) errorUrl.searchParams.set("state", state);
      return NextResponse.redirect(errorUrl.toString());
    }
  }

  // Generate auth code
  const code = generateAuthCode();
  const scopes = scope.split(" ").filter(Boolean);

  await db.oAuthCode.create({
    data: {
      code,
      clientId,
      userId,
      tenantId,
      scopes,
      codeChallenge: codeChallenge ?? null,
      codeChallengeMethod: codeChallenge ? codeChallengeMethod : null,
      redirectUri,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
    },
  });

  // Redirect back to the client with the code
  const callbackUrl = new URL(redirectUri);
  callbackUrl.searchParams.set("code", code);
  if (state) callbackUrl.searchParams.set("state", state);

  return NextResponse.redirect(callbackUrl.toString());
}
