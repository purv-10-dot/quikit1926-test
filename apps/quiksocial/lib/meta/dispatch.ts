/**
 * Meta publish dispatcher — shared by /api/cron/publish-scheduled and
 * /api/posts/[id]/publish-now.
 *
 * Resolves the right credentials (active SocialAccount for the post's
 * brand, or env-var fallback for demo / unconfigured workspaces),
 * validates the access token, then dispatches to the platform publisher.
 *
 * Returns a uniform { success, mediaId, permalink, error, platform }
 * result so callers can write status transitions without duplicating
 * platform branching logic.
 *
 * Ported to QuikIT (Phase 3, Batch 2). Caller now provides `orgId` so
 * the SocialAccount lookup is org-scoped from the start.
 */

import {
  publishToInstagram,
  type InstagramPublishResult,
} from "@/lib/meta/instagram-publisher";
import {
  publishToFacebook,
  type FacebookPublishResult,
} from "@/lib/meta/facebook-publisher";
import {
  validateFacebookToken,
  validateInstagramToken,
} from "@/lib/meta/token-validator";
import { db } from "@/lib/db";

export type SupportedPlatform = "instagram" | "facebook";

export interface PublishDispatchResult {
  success: boolean;
  platform: SupportedPlatform;
  mediaId?: string;
  permalink?: string | null;
  error?: string;
  /**
   * True if the failure was caused by an expired or insufficient token —
   * the UI should prompt the user to reconnect the account.
   */
  needsReconnect?: boolean;
}

interface ResolvedCredentials {
  accessToken: string;
  /** Display identifier — what we show in the UI (FB Page ID for FB rows,
   *  IG Business Account ID for IG rows in the happy path). Do NOT use
   *  this for Graph API calls — `pageId` and `igBusinessAccountId` are
   *  the authoritative typed slots. */
  accountId: string;
  /** Facebook Page ID. Source of truth for FB Graph calls + the lookup
   *  base for `GET /{page_id}?fields=instagram_business_account` when
   *  self-healing a legacy IG row. */
  pageId: string | null;
  /** Instagram Business Account ID. Required for every IG Graph call —
   *  POST /{ig-user-id}/media, /media_publish, token validation. Null on
   *  FB rows AND on legacy IG rows created before the column existed.
   *  When null on an IG publish attempt, the self-heal step in
   *  `resolveCredentials` tries one Graph API lookup; if that also fails,
   *  the publisher returns the user-facing "please reconnect" error. */
  igBusinessAccountId: string | null;
  /** Always from a connected SocialAccount row (no env-var fallback). */
  source: "social-account";
}

/**
 * One-shot lookup: given a Facebook Page ID + Page access token, return
 * the Page's linked Instagram Business Account ID (or null if none).
 *
 * Used by `resolveCredentials` to self-heal legacy IG rows that pre-date
 * the `igBusinessAccountId` column. The result is persisted to the
 * SocialAccount row so subsequent publishes skip this lookup. Failure
 * (token expired, no IG linked, network error) returns null — the
 * caller then surfaces the user-facing reconnect prompt.
 */
async function lookupIgBusinessAccountId(
  pageId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v24.0/${encodeURIComponent(pageId)}` +
        `?fields=instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
    );
    const data = (await res.json().catch(() => null)) as
      | { instagram_business_account?: { id?: string }; error?: { message?: string } }
      | null;
    if (!data || data.error || !data.instagram_business_account?.id) {
      if (data?.error) {
        console.warn(
          "[dispatch] IG business account lookup failed:",
          data.error.message ?? data.error,
        );
      }
      return null;
    }
    return data.instagram_business_account.id;
  } catch (err) {
    console.warn("[dispatch] IG business account lookup network error:", err);
    return null;
  }
}

function pickFirstImage(post: {
  imageUrls?: string[] | null;
  aiImageUrl?: string | null;
}): string | null {
  if (Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
    return post.imageUrls[0]!;
  }
  if (post.aiImageUrl) return post.aiImageUrl;
  return null;
}

/**
 * Resolve which platform to publish to. Supports a single platform string,
 * comma-separated list, or "all". Defaults to Instagram.
 */
export function resolvePlatform(
  postPlatform: string | null | undefined,
): SupportedPlatform {
  if (!postPlatform || postPlatform === "all") return "instagram";
  const first = postPlatform.split(",")[0]?.trim().toLowerCase();
  if (first === "facebook") return "facebook";
  return "instagram";
}

async function resolveCredentials(
  orgId: string,
  brandId: string | null | undefined,
  userId: string | null | undefined,
  platform: SupportedPlatform,
): Promise<{ creds?: ResolvedCredentials; error?: string }> {
  // 1. Brand-scoped lookup first (the team-member case)
  let row: Awaited<ReturnType<typeof db.socialAccount.findFirst>> = null;
  if (brandId) {
    row = await db.socialAccount.findFirst({
      where: { orgId, brandId, platform, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  // 2. User-scoped fallback (single-tenant case — no brand attached)
  if (!row && userId) {
    row = await db.socialAccount.findFirst({
      where: { orgId, userId, platform, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  if (!row?.accessToken || !row?.accountId) {
    // No connected SocialAccount for the brand or user. There is deliberately
    // NO env-var fallback: publishing to a shared demo account
    // (META_PAGE_ACCESS_TOKEN / META_IG_ACCOUNT_ID / META_PAGE_ID) silently
    // "succeeds" and flips the post to Published even though nothing reached
    // the user's selected page — masking the real "not connected" state. The
    // cron + publish-now routes turn this error into status='failed' with the
    // message as `failedReason` so the Content Hub surfaces a clear
    // "connect account" prompt.
    return {
      error: `No ${platform} account connected for this brand. Connect ${platform} in Integrations and try again.`,
    };
  }

  // Self-heal legacy IG rows that pre-date the `igBusinessAccountId`
  // column. A row connected before this fix shipped stores only the FB
  // Page ID. Without this branch the first publish attempt fails with
  // the cryptic "Object does not exist" Graph error; with it, we do one
  // extra Graph API call to resolve the IG Business Account ID, write
  // it back to the row, and proceed. Subsequent publishes skip this
  // entirely.
  let igBusinessAccountId = row.igBusinessAccountId ?? null;
  if (
    platform === "instagram" &&
    !igBusinessAccountId &&
    row.pageId &&
    row.accessToken
  ) {
    const looked = await lookupIgBusinessAccountId(row.pageId, row.accessToken);
    if (looked) {
      try {
        await db.socialAccount.update({
          where: { id: row.id },
          data: { igBusinessAccountId: looked },
        });
        console.info(
          `[dispatch] self-healed SocialAccount ${row.id} with igBusinessAccountId=${looked}`,
        );
      } catch (err) {
        console.warn(
          `[dispatch] self-heal write failed for SocialAccount ${row.id}:`,
          err,
        );
      }
      igBusinessAccountId = looked;
    }
  }

  return {
    creds: {
      accessToken: row.accessToken,
      accountId: row.accountId,
      pageId: row.pageId ?? null,
      igBusinessAccountId,
      source: "social-account",
    },
  };
}

interface DispatchablePost {
  orgId: string;
  brandId: string | null | undefined;
  /** OAuth-connected user id (Post.createdBy). */
  userId: string | null | undefined;
  platform: string | null | undefined;
  content: string;
  imageUrls?: string[] | null;
  aiImageUrl?: string | null;
}

/**
 * Resolve credentials, validate the token, and call the right platform
 * publisher. The caller is responsible for translating the result into
 * Post status transitions and persistence.
 */
export async function publishPost(
  post: DispatchablePost,
): Promise<PublishDispatchResult> {
  const platform = resolvePlatform(post.platform);

  const imageUrl = pickFirstImage(post);
  if (!imageUrl) {
    return {
      success: false,
      platform,
      error: "Post has no image to publish",
    };
  }

  const { creds, error: credErr } = await resolveCredentials(
    post.orgId,
    post.brandId,
    post.userId,
    platform,
  );
  if (!creds) {
    return { success: false, platform, error: credErr ?? "No credentials" };
  }

  // Instagram requires the IG Business Account ID for every Graph API
  // call. If self-heal couldn't recover one (no IG linked to the Page,
  // or the lookup itself failed), surface the user-friendly reconnect
  // prompt instead of letting the IG Graph API return its cryptic
  // "Object with ID '...' does not exist" error.
  if (platform === "instagram" && !creds.igBusinessAccountId) {
    return {
      success: false,
      platform,
      error:
        "Instagram Business Account ID not found — please reconnect your Instagram account in Integrations.",
      needsReconnect: true,
    };
  }

  const validation =
    platform === "instagram"
      ? await validateInstagramToken(creds.accessToken, creds.igBusinessAccountId!)
      : await validateFacebookToken(creds.accessToken);
  if (!validation.valid) {
    return {
      success: false,
      platform,
      error: validation.error ?? "Token validation failed",
      needsReconnect: validation.needsReconnect,
    };
  }

  if (platform === "instagram") {
    const r: InstagramPublishResult = await publishToInstagram({
      igUserId: creds.igBusinessAccountId!,
      accessToken: creds.accessToken,
      imageUrl,
      caption: post.content,
    });
    return {
      success: r.success,
      platform,
      mediaId: r.mediaId,
      permalink: r.permalink,
      error: r.error,
    };
  }

  // facebook
  if (!creds.pageId) {
    return {
      success: false,
      platform,
      error:
        "Facebook publish requires a pageId — none stored on the SocialAccount.",
    };
  }
  const r: FacebookPublishResult = await publishToFacebook({
    pageId: creds.pageId,
    accessToken: creds.accessToken,
    imageUrl,
    caption: post.content,
  });
  return {
    success: r.success,
    platform,
    mediaId: r.postId,
    permalink: null,
    error: r.error,
  };
}
