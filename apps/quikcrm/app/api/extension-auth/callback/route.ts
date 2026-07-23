import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, decodeJwt } from "jose";
import { encode } from "next-auth/jwt";
import { publicBaseUrl } from "@quikit/auth/public-url";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/extension-auth/callback?code=...&state=...
 *
 * Paired callback for the extension-only OAuth flow started in
 * `/api/extension-auth/start`. Steps:
 *   1. Verify the signed `state` (HS256 / NEXTAUTH_SECRET) → provider + return.
 *   2. Exchange the authorization `code` at the provider token endpoint.
 *   3. Read the verified email from the returned id_token.
 *   4. GATE: the email MUST already exist in the QuikCRM User table. Unknown
 *      emails are rejected — no user is created, no signup happens.
 *   5. Mint a NextAuth-compatible session token (same shape/secret as
 *      app/auth-handoff/route.ts) and hand it back to the extension in the
 *      fragment of its chromiumapp.org return URL.
 *
 * This runs entirely outside NextAuth's provider machinery, so the web /login
 * flow (QuikIT IdP SSO) is completely unaffected.
 */

type Provider = "google" | "microsoft";

interface StatePayload {
  provider?: string;
  return?: string;
}

/** Append a fragment param to the extension's return URL. */
function returnWith(returnUrl: string, params: Record<string, string>): string {
  const frag = new URLSearchParams(params).toString();
  return `${returnUrl}#${frag}`;
}

export async function GET(request: NextRequest) {
  const nextAuthSecret = process.env.NEXTAUTH_SECRET;
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const stateToken = params.get("state");
  const oauthError = params.get("error");

  if (!nextAuthSecret) {
    return NextResponse.json(
      { success: false, error: "Server misconfigured" },
      { status: 500 },
    );
  }

  // Verify state first so we know where to send failures. Without a valid
  // state we have no trusted return URL, so we can only return JSON.
  let provider: Provider;
  let returnUrl: string;
  try {
    if (!stateToken) throw new Error("Missing state");
    const { payload } = await jwtVerify(
      stateToken,
      new TextEncoder().encode(nextAuthSecret),
      { clockTolerance: "10s" },
    );
    const s = payload as StatePayload;
    if (
      (s.provider !== "google" && s.provider !== "microsoft") ||
      !s.return ||
      !isValidReturnUrl(s.return)
    ) {
      throw new Error("Invalid state");
    }
    provider = s.provider;
    returnUrl = s.return;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid or expired login state" },
      { status: 400 },
    );
  }

  // User cancelled / provider-side error → bounce back to the extension.
  if (oauthError || !code) {
    return NextResponse.redirect(returnWith(returnUrl, { error: "oauth_failed" }));
  }

  try {
    const origin = publicBaseUrl(request);
    const redirectUri = `${origin}/api/extension-auth/callback`;

    const idToken = await exchangeCodeForIdToken(provider, code, redirectUri);
    if (!idToken) {
      return NextResponse.redirect(returnWith(returnUrl, { error: "oauth_failed" }));
    }

    const claims = decodeJwt(idToken) as {
      email?: string;
      preferred_username?: string;
    };
    const email = (claims.email ?? claims.preferred_username ?? "").toLowerCase().trim();
    if (!email) {
      return NextResponse.redirect(
        returnWith(returnUrl, { error: "not_authorized" }),
      );
    }

    // EXISTING-USER GATE — mirrors packages/auth/index.ts signIn callback.
    // Case-insensitive so mixed-case historical rows still match. No user is
    // ever created here.
    const dbUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isSuperAdmin: true,
      },
    });
    if (!dbUser) {
      return NextResponse.redirect(
        returnWith(returnUrl, { error: "not_authorized" }),
      );
    }

    // Mint a NextAuth-compatible session token (same claims + secret as
    // app/auth-handoff/route.ts) so the extension stores a token consistent
    // with this app's session format.
    const fullName = `${dbUser.firstName} ${dbUser.lastName}`.trim();
    const token = await encode({
      token: {
        sub: dbUser.id,
        id: dbUser.id,
        email: dbUser.email,
        isSuperAdmin: dbUser.isSuperAdmin,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        name: fullName || dbUser.email,
      },
      secret: nextAuthSecret,
      maxAge: 7 * 24 * 60 * 60,
    });

    return NextResponse.redirect(
      returnWith(returnUrl, { token, email: dbUser.email }),
    );
  } catch (error: unknown) {
    // Any hard failure (network to provider, token endpoint error) → bounce
    // back to the extension so it can show a friendly message.
    console.error("[extension-auth.callback]", error);
    return NextResponse.redirect(returnWith(returnUrl, { error: "oauth_failed" }));
  }
}

function isValidReturnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}

/**
 * Exchange an authorization code for the provider's id_token. Returns the raw
 * id_token JWT string, or null when the token endpoint didn't return one.
 */
async function exchangeCodeForIdToken(
  provider: Provider,
  code: string,
  redirectUri: string,
): Promise<string | null> {
  const isGoogle = provider === "google";
  const clientId = isGoogle
    ? process.env.GOOGLE_CLIENT_ID
    : process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = isGoogle
    ? process.env.GOOGLE_CLIENT_SECRET
    : process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(`${provider} OAuth is not configured`);
  }

  const tokenUrl = isGoogle
    ? "https://oauth2.googleapis.com/token"
    : `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id_token?: string };
  return json.id_token ?? null;
}
