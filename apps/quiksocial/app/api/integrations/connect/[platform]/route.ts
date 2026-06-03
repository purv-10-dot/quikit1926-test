/**
 * GET /api/integrations/connect/[platform]?brandId=X
 *
 * Initiates the third-party OAuth flow. Builds a signed state, derives the
 * callback URL from NEXTAUTH_URL, and redirects to the platform's
 * authorization dialog.
 *
 * Supported platforms: facebook, instagram, linkedin, youtube.
 *
 * Ported to QuikIT (Phase 3, Batch 3):
 *   - withOrgAuth wrapper (returns 401 JSON if not signed in)
 *   - Callback URL anchored to NEXTAUTH_URL (= http://localhost:3007 in dev)
 */

import { NextRequest, NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { signState, appUrl } from "@/lib/oauth/state";

// ─── OAuth authorization URLs ──────────────────────────────────────────────

function facebookAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    response_type: "code",
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${params}`;
}

function linkedinAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile w_member_social",
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
}

function youtubeAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: [
      "https://www.googleapis.com/auth/youtube",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/userinfo.profile",
    ].join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ─── GET /api/integrations/connect/[platform]?brandId=X ────────────────────

export const GET = withOrgAuth<{ platform: string }>(
  async ({ userId }, req: NextRequest, { params }) => {
    const { platform } = params;
    const brandId = new URL(req.url).searchParams.get("brandId") ?? "";
    const base = appUrl();
    const redirectUri = `${base}/api/integrations/callback/${platform}`;
    const state = signState({ userId, brandId, platform });

    let authUrl: string;

    switch (platform) {
      case "facebook": {
        const clientId = process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID;
        if (!clientId) {
          return NextResponse.json(
            { success: false, error: "META_APP_ID not configured" },
            { status: 500 },
          );
        }
        authUrl = facebookAuthUrl(
          clientId,
          redirectUri,
          state,
          "pages_manage_posts,pages_read_engagement,pages_show_list,business_management",
        );
        break;
      }

      case "instagram": {
        const clientId = process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID;
        if (!clientId) {
          return NextResponse.json(
            { success: false, error: "META_APP_ID not configured" },
            { status: 500 },
          );
        }
        // Instagram Graph API uses Facebook Login with Instagram scopes.
        authUrl = facebookAuthUrl(
          clientId,
          redirectUri,
          state,
          "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement,business_management",
        );
        break;
      }

      case "linkedin": {
        const clientId = process.env.LINKEDIN_APP_ID;
        if (!clientId) {
          return NextResponse.json(
            { success: false, error: "LINKEDIN_APP_ID not configured" },
            { status: 500 },
          );
        }
        authUrl = linkedinAuthUrl(clientId, redirectUri, state);
        break;
      }

      case "youtube": {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
          return NextResponse.json(
            { success: false, error: "GOOGLE_CLIENT_ID not configured" },
            { status: 500 },
          );
        }
        authUrl = youtubeAuthUrl(clientId, redirectUri, state);
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unsupported platform: ${platform}` },
          { status: 400 },
        );
    }

    return NextResponse.redirect(authUrl);
  },
);
