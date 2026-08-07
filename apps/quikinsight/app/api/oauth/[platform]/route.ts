import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { PLATFORM_CONFIGS } from "@/lib/types/connections";
import type { Platform } from "@/lib/types/connections";
import { signOAuthState } from "@/lib/oauthState";
import crypto from "crypto";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3011";

// API-key based platforms (e.g. QuikCRM) have no OAuth endpoint and are omitted.
const OAUTH_ENDPOINTS: Partial<Record<Platform, { authUrl: string; clientId: string }>> = {
  google: {
    authUrl:  "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  },
  // Google Ads is a SEPARATE OAuth app from the analytics/organic Google auth.
  google_ads: {
    authUrl:  "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: process.env.GOOGLE_ADS_CLIENT_ID ?? "",
  },
  meta: {
    authUrl:  "https://www.facebook.com/v19.0/dialog/oauth",
    clientId: process.env.META_APP_ID ?? "",
  },
  // Meta Ads is a SEPARATE Meta app from the FB/Instagram organic auth.
  meta_ads: {
    authUrl:  "https://www.facebook.com/v19.0/dialog/oauth",
    clientId: process.env.META_ADS_APP_ID ?? "",
  },
  linkedin: {
    authUrl:  "https://www.linkedin.com/oauth/v2/authorization",
    clientId: process.env.LINKEDIN_CLIENT_ID ?? "",
  },
  hubspot: {
    authUrl:  "https://app.hubspot.com/oauth/authorize",
    clientId: process.env.HUBSPOT_CLIENT_ID ?? "",
  },
  salesforce: {
    authUrl:  "https://login.salesforce.com/services/oauth2/authorize",
    clientId: process.env.SALESFORCE_CLIENT_ID ?? "",
  },
  gbp: {
    // GBP rides on Google OAuth with the business.manage scope
    authUrl:  "https://accounts.google.com/o/oauth2/v2/auth",
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
  },
  mailchimp: {
    authUrl:  "https://login.mailchimp.com/oauth2/authorize",
    clientId: process.env.MAILCHIMP_CLIENT_ID ?? "",
  },
  dynamics: {
    authUrl:  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    clientId: process.env.DYNAMICS_CLIENT_ID ?? "",
  },
  zoho: {
    authUrl:  "https://accounts.zoho.com/oauth/v2/auth",
    clientId: process.env.ZOHO_CLIENT_ID ?? "",
  },
};

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", BASE_URL));
  }

  const platform = params.platform as Platform;
  const config   = PLATFORM_CONFIGS[platform];
  const endpoint = OAUTH_ENDPOINTS[platform];

  if (!config || !endpoint) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }
  if (!endpoint.clientId || !endpoint.authUrl) {
    return NextResponse.json(
      { error: `${platform} OAuth not configured`, needsCredentials: true },
      { status: 503 }
    );
  }

  // Mailchimp rejects "localhost" and requires a 127.0.0.1 loopback redirect.
  // Since that callback host won't carry our cookies, Mailchimp uses a signed
  // `state` (userId baked in) instead of a CSRF cookie. Every other platform
  // keeps the cookie-based flow on localhost unchanged.
  const useSignedState = platform === "mailchimp";
  const appOrigin = useSignedState ? BASE_URL.replace("localhost", "127.0.0.1") : BASE_URL;

  const state    = useSignedState
    ? signOAuthState(session.user.id)
    : crypto.randomBytes(16).toString("hex");
  const callback = `${appOrigin}/api/oauth/${platform}/callback`;

  // Dynamics 365 uses Azure AD with a resource-scoped permission against the
  // org's Web API, plus offline_access for a refresh token.
  const dynamicsResource = (process.env.DYNAMICS_RESOURCE ?? "").replace(/\/$/, "");
  const scope = platform === "dynamics"
    ? `offline_access ${dynamicsResource ? `${dynamicsResource}/.default` : "https://globaldisco.crm.dynamics.com/user_impersonation"}`
    : config.scopes.join(platform === "meta" || platform === "meta_ads" || platform === "zoho" ? "," : " ");

  // HubSpot requires PKCE — generate code_verifier + code_challenge
  let codeVerifier: string | undefined;
  let codeChallenge: string | undefined;
  if (platform === "hubspot") {
    codeVerifier  = crypto.randomBytes(32).toString("base64url");
    codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  }

  const params2 = new URLSearchParams({
    client_id:     endpoint.clientId,
    redirect_uri:  callback,
    response_type: "code",
    scope,
    state,
    // Flows that need offline access for refresh tokens
    ...((platform === "google" || platform === "google_ads" || platform === "gbp" || platform === "zoho") && {
      access_type:  "offline",
      prompt:       "consent",
    }),
    ...(platform === "dynamics" && { response_mode: "query" }),
    ...(codeChallenge && {
      code_challenge:        codeChallenge,
      code_challenge_method: "S256",
    }),
  });

  const authUrl = `${endpoint.authUrl}?${params2.toString()}`;

  const res = NextResponse.redirect(authUrl);
  // Signed-state flows (Mailchimp) carry CSRF protection in the state itself,
  // so no cookie is set — the callback lands on a different host anyway.
  if (!useSignedState) {
    res.cookies.set(`oauth_state_${platform}`, state, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      maxAge:   600, // 10 minutes
      path:     "/",
    });
  }
  if (codeVerifier) {
    res.cookies.set(`oauth_pkce_${platform}`, codeVerifier, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      maxAge:   600,
      path:     "/",
    });
  }
  return res;
}
