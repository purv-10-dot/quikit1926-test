/**
 * GET /api/integrations/callback/[platform]
 *
 * OAuth redirect target. Exchanges the auth code for tokens, fetches the
 * connected account profile, and upserts a SocialAccount row.
 *
 * For Facebook / Instagram we persist the PAGE access token (not the
 * user token) — IG content publishing rejects the user token.
 *
 * Ported to QuikIT (Phase 3, Batch 3):
 *   - Auth: NO session — userId comes from the HMAC-signed state.
 *   - orgId: hardcoded to DEFAULT_ORG_ID (multi-org callback comes when
 *     the OAuth state format is extended to carry orgId — follow-up PR).
 *   - Composite upsert key uses orgId_userId_platform_accountId.
 *   - Errors and success both end as redirects to /dashboard/integrations.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyState, appUrl } from "@/lib/oauth/state";
import { db } from "@/lib/db";

const DEFAULT_ORG_ID =
  process.env.DEFAULT_ORG_ID ||
  process.env.DEFAULT_TENANT_ID ||
  "org_quiksocial_default";

// ─── Token exchange + profile fetch types ─────────────────────────────────

interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface ProfileResult {
  accountId: string;
  accountName: string;
  profilePicture?: string;
  pageId?: string;
  /**
   * Page access token for FB/IG. We store this on SocialAccount.accessToken
   * (NOT the user token) because IG content publishing requires the
   * Page-bound token.
   */
  pageAccessToken?: string;
}

// ── Facebook / Instagram ───────────────────────────────────────────────────

const META_GRAPH_VERSION = "v24.0";
const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

async function exchangeFacebookCode(
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const metaAppId = process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID;
  const metaAppSecret =
    process.env.META_APP_SECRET ?? process.env.FACEBOOK_APP_SECRET;

  if (!metaAppId || !metaAppSecret) {
    throw new Error("META_APP_ID / META_APP_SECRET not configured");
  }

  const params = new URLSearchParams({
    client_id: metaAppId,
    client_secret: metaAppSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${params}`);
  const text = await res.text();
  console.log("[integrations callback] Raw response:", text.substring(0, 500));
  const data = JSON.parse(text) as Record<string, unknown> & {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? "Facebook token exchange failed");
  }

  // Exchange short-lived → long-lived (60-day).
  const llParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: metaAppId,
    client_secret: metaAppSecret,
    fb_exchange_token: data.access_token!,
  });
  const llRes = await fetch(`${META_GRAPH_BASE}/oauth/access_token?${llParams}`);
  const llData = (await llRes.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  const finalToken = llData.access_token ?? data.access_token!;
  const expiresIn = llData.expires_in ?? data.expires_in;

  return {
    accessToken: finalToken,
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined,
  };
}

async function getFacebookProfile(accessToken: string): Promise<ProfileResult> {
  const meRes = await fetch(
    `${META_GRAPH_BASE}/me?fields=id,name,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`,
  );
  const me = (await meRes.json()) as {
    id: string;
    name?: string;
    picture?: { data?: { url?: string } };
  };

  const pagesRes = await fetch(
    `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`,
  );
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      picture?: { data?: { url?: string } };
    }>;
  };
  const pages = pagesData.data ?? [];

  if (pages.length === 0) {
    console.warn("[integrations callback] Facebook account has no managed pages");
    return {
      accountId: me.id,
      accountName: me.name ?? "Facebook User",
      profilePicture: me.picture?.data?.url ?? undefined,
    };
  }

  const page = pages[0]!;
  return {
    accountId: page.id,
    accountName: page.name,
    profilePicture: page.picture?.data?.url ?? undefined,
    pageId: page.id,
    pageAccessToken: page.access_token,
  };
}

async function getInstagramProfile(accessToken: string): Promise<ProfileResult> {
  const pagesRes = await fetch(
    `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url}&access_token=${encodeURIComponent(accessToken)}`,
  );
  const pagesData = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name: string;
      access_token: string;
      instagram_business_account?: {
        id: string;
        username?: string;
        profile_picture_url?: string;
      };
    }>;
  };
  const pages = pagesData.data ?? [];

  for (const page of pages) {
    const ig = page.instagram_business_account;
    if (ig?.id) {
      return {
        accountId: ig.id,
        accountName: ig.username ?? page.name ?? `IG-${ig.id}`,
        profilePicture: ig.profile_picture_url ?? undefined,
        pageId: page.id,
        pageAccessToken: page.access_token,
      };
    }
  }

  // No IG Business account found — fall back to FB user identity. UI can
  // still show "connected" with an instructional state.
  const fbProfile = await getFacebookProfile(accessToken);
  return { ...fbProfile, pageId: undefined };
}

// ── LinkedIn ───────────────────────────────────────────────────────────────

async function exchangeLinkedInCode(
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: process.env.LINKEDIN_APP_ID!,
    client_secret: process.env.LINKEDIN_APP_SECRET!,
  });

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? "LinkedIn token exchange failed");
  }

  return {
    accessToken: data.access_token!,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  };
}

async function getLinkedInProfile(accessToken: string): Promise<ProfileResult> {
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await res.json()) as {
    sub?: string;
    id?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
  };
  const givenName = data.given_name || "";
  const familyName = data.family_name || "";
  const fullName = `${givenName} ${familyName}`.trim();
  return {
    accountId: data.sub ?? data.id ?? "linkedin-user",
    accountName: data.name || fullName || "LinkedIn User",
    profilePicture: data.picture ?? undefined,
  };
}

// ── YouTube (Google OAuth 2.0) ─────────────────────────────────────────────

async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<TokenResult> {
  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || data.error) {
    throw new Error(data.error_description ?? "Google token exchange failed");
  }

  return {
    accessToken: data.access_token!,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  };
}

async function getYouTubeProfile(accessToken: string): Promise<ProfileResult> {
  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
    }>;
  };
  const channel = data.items?.[0];

  if (!channel) {
    const uiRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ui = (await uiRes.json()) as {
      sub?: string;
      name?: string;
      picture?: string;
    };
    return {
      accountId: ui.sub ?? "youtube-user",
      accountName: ui.name ?? "YouTube User",
      profilePicture: ui.picture ?? undefined,
    };
  }

  return {
    accountId: channel.id,
    accountName: channel.snippet?.title ?? "YouTube Channel",
    profilePicture: channel.snippet?.thumbnails?.default?.url ?? undefined,
  };
}

// ─── Main callback handler ─────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } },
) {
  const { platform } = params;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const base = appUrl();
  const failUrl = `${base}/dashboard/integrations?error=oauth_failed`;

  if (oauthError) {
    console.error(`[integrations callback] OAuth error for ${platform}: ${oauthError}`);
    return NextResponse.redirect(failUrl);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(failUrl);
  }

  const stateData = verifyState(stateParam);
  if (!stateData) {
    console.error("[integrations callback] Invalid state signature");
    return NextResponse.redirect(failUrl);
  }

  const { userId, brandId } = stateData;
  // TODO(integration): once OAuthState carries orgId, swap this to use
  // stateData.orgId. Single-org default until then.
  const orgId = DEFAULT_ORG_ID;
  const redirectUri = `${base}/api/integrations/callback/${platform}`;

  try {
    let tokens: TokenResult;
    let profile: ProfileResult;

    switch (platform) {
      case "facebook":
        tokens = await exchangeFacebookCode(code, redirectUri);
        profile = await getFacebookProfile(tokens.accessToken);
        break;

      case "instagram":
        tokens = await exchangeFacebookCode(code, redirectUri);
        profile = await getInstagramProfile(tokens.accessToken);
        break;

      case "linkedin":
        tokens = await exchangeLinkedInCode(code, redirectUri);
        profile = await getLinkedInProfile(tokens.accessToken);
        break;

      case "youtube":
        tokens = await exchangeGoogleCode(code, redirectUri);
        profile = await getYouTubeProfile(tokens.accessToken);
        break;

      default:
        return NextResponse.redirect(failUrl);
    }

    // For FB/IG, persist the PAGE access token (not the user token).
    const tokenToStore = profile.pageAccessToken ?? tokens.accessToken;

    // Upsert: one active account per (org, user, platform, accountId).
    // The schema's `@@unique([orgId, userId, platform, accountId])` backs
    // `orgId_userId_platform_accountId` as the composite key.
    const data = {
      orgId,
      userId,
      brandId: brandId || null,
      platform,
      accountId: profile.accountId,
      accountName: profile.accountName,
      profilePicture: profile.profilePicture ?? null,
      pageId: profile.pageId ?? null,
      accessToken: tokenToStore,
      refreshToken: tokens.refreshToken ?? null,
      expiresAt: tokens.expiresAt ?? null,
      isActive: true,
    };

    await db.socialAccount.upsert({
      where: {
        orgId_userId_platform_accountId: {
          orgId,
          userId,
          platform,
          accountId: profile.accountId,
        },
      },
      update: data,
      create: data,
    });

    return NextResponse.redirect(
      `${base}/dashboard/integrations?connected=${platform}`,
    );
  } catch (error: unknown) {
    console.error(`[integrations callback] ${platform} error:`, error);
    return NextResponse.redirect(failUrl);
  }
}
