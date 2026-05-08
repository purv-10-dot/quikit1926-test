/**
 * Facebook Page publisher — Graph API v24.0.
 *
 * Single-image post recipe ported from v1 (reference-v1-latest):
 *   POST /{page-id}/photos
 *     body: { url, caption, access_token }
 *
 * Caption truncated to 2200 chars to keep parity with the IG path.
 *
 * Returns { success, postId, error } — never throws.
 */

const GRAPH_VERSION = "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const FB_CAPTION_MAX = 2200;

export interface FacebookPublishInput {
  pageId: string;          // Facebook Page ID
  accessToken: string;     // Page access token (NOT user token)
  imageUrl: string;        // Public URL — must be reachable by Meta
  caption: string;
}

export interface FacebookPublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

function truncateCaption(caption: string): string {
  if (caption.length <= FB_CAPTION_MAX) return caption;
  const trimmed = caption.substring(0, FB_CAPTION_MAX - 3) + "...";
  console.log(
    `[fb-publisher] Caption truncated ${caption.length} → ${trimmed.length}`
  );
  return trimmed;
}

function describeMetaError(err: { code?: number; error_subcode?: number; message?: string }): string {
  if (err.code === 190) {
    return "Facebook access token has expired. Reconnect the account in Integrations.";
  }
  if (err.code === 200) {
    return "Insufficient Facebook Page permissions. Reconnect with pages_manage_posts.";
  }
  return err.message ?? "Facebook publish failed";
}

export async function publishToFacebook(
  input: FacebookPublishInput
): Promise<FacebookPublishResult> {
  const { pageId, accessToken, imageUrl, caption } = input;

  if (!pageId || !accessToken || !imageUrl) {
    return {
      success: false,
      error: "Missing pageId, accessToken, or imageUrl",
    };
  }
  if (!/^https?:\/\//.test(imageUrl)) {
    return {
      success: false,
      error: "Facebook requires an absolute http(s) image URL",
    };
  }

  const truncated = truncateCaption(caption);
  const url = `${GRAPH_BASE}/${pageId}/photos`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: imageUrl,
        caption: truncated,
        access_token: accessToken,
      }),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    console.error("[fb-publisher] network error:", e);
    return { success: false, error: `Facebook publish network error: ${msg}` };
  }

  const data = (await res.json().catch(() => null)) as
    | {
        id?: string;
        post_id?: string;
        error?: { code?: number; error_subcode?: number; message?: string };
      }
    | null;

  if (!data) {
    return { success: false, error: "Facebook returned a non-JSON response" };
  }
  if (data.error) {
    console.error("[fb-publisher] publish error:", data.error);
    return { success: false, error: describeMetaError(data.error) };
  }

  // /photos returns { id, post_id } where post_id is the feed-story id —
  // prefer post_id for cross-referencing engagement, fall back to id.
  const postId = data.post_id ?? data.id;
  if (!postId) {
    return { success: false, error: "Facebook returned no post ID" };
  }

  console.log(`[fb-publisher] Published Facebook post ${postId} on page ${pageId}`);
  return { success: true, postId };
}
