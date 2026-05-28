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
  /** For Instagram: IG Business Account ID. For Facebook: Page ID. */
  accountId: string;
  /** Always the Page ID. Same as accountId for Facebook. */
  pageId: string | null;
  /** Always from a connected SocialAccount row (no env-var fallback). */
  source: "social-account";
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
  if (brandId) {
    const brandAccount = await db.socialAccount.findFirst({
      where: { orgId, brandId, platform, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (brandAccount?.accessToken && brandAccount?.accountId) {
      return {
        creds: {
          accessToken: brandAccount.accessToken,
          accountId: brandAccount.accountId,
          pageId: brandAccount.pageId ?? null,
          source: "social-account",
        },
      };
    }
  }

  // 2. User-scoped fallback (single-tenant case — no brand attached)
  if (userId) {
    const userAccount = await db.socialAccount.findFirst({
      where: { orgId, userId, platform, isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    if (userAccount?.accessToken && userAccount?.accountId) {
      return {
        creds: {
          accessToken: userAccount.accessToken,
          accountId: userAccount.accountId,
          pageId: userAccount.pageId ?? null,
          source: "social-account",
        },
      };
    }
  }

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

  const validation =
    platform === "instagram"
      ? await validateInstagramToken(creds.accessToken, creds.accountId)
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
      igUserId: creds.accountId,
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
