import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { publicBaseUrl } from "@quikit/auth/public-url";

/**
 * GET /api/extension-auth/start?provider=google|microsoft&return=<chromiumapp url>
 *
 * Extension-only OAuth kickoff. The LinkedIn Chrome extension opens this URL
 * via `chrome.identity.launchWebAuthFlow`. We build the provider's
 * authorization-code URL (Google or Microsoft directly — NOT via NextAuth, so
 * the web /login flow is left completely untouched) and redirect the browser
 * there. The paired callback (`/api/extension-auth/callback`) does the code
 * exchange, enforces the existing-QuikCRM-user gate, and hands a token back to
 * the extension.
 *
 * `state` is a short-lived HS256 JWT (signed with NEXTAUTH_SECRET) carrying the
 * provider and the extension's `chromiumapp.org` return URL. Signing it means
 * the callback can trust those values without server-side session storage, and
 * an attacker can't forge a callback that redirects a token to an arbitrary URL.
 */

const PROVIDERS = ["google", "microsoft"] as const;
type Provider = (typeof PROVIDERS)[number];

function isValidReturnUrl(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    // launchWebAuthFlow always returns to https://<extension-id>.chromiumapp.org/
    return url.protocol === "https:" && url.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const provider = params.get("provider");
    const returnUrl = params.get("return");

    if (!provider || !PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing provider" },
        { status: 400 },
      );
    }
    if (!isValidReturnUrl(returnUrl)) {
      return NextResponse.json(
        { success: false, error: "Invalid or missing return URL" },
        { status: 400 },
      );
    }

    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    if (!nextAuthSecret) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const clientId =
      provider === "google"
        ? process.env.GOOGLE_CLIENT_ID
        : process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) {
      return NextResponse.json(
        { success: false, error: `${provider} OAuth is not configured` },
        { status: 500 },
      );
    }

    // Our own callback — must be registered as an authorized redirect URI in
    // the Google Cloud / Entra app registration. Built from this app's public
    // origin (never request.url, which resolves to the pod bind address).
    const origin = publicBaseUrl(request);
    const redirectUri = `${origin}/api/extension-auth/callback`;

    // Signed, short-lived state (5 min) carrying what the callback needs.
    const state = await new SignJWT({ provider, return: returnUrl })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(nextAuthSecret));

    const authorizeUrl =
      provider === "google"
        ? buildGoogleUrl(clientId, redirectUri, state)
        : buildMicrosoftUrl(clientId, redirectUri, state);

    return NextResponse.redirect(authorizeUrl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

function buildGoogleUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  // Force the account chooser so users can switch accounts on each login.
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  return url.toString();
}

function buildMicrosoftUrl(clientId: string, redirectUri: string, state: string): string {
  const tenant = process.env.MICROSOFT_TENANT_ID || "common";
  const url = new URL(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  return url.toString();
}
