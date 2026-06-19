/**
 * Instagram publisher — Graph API v24.0.
 *
 * Three-step recipe ported from v1 (reference-v1-latest):
 *   1. POST /{ig-user-id}/media       → returns creation_id
 *   2. POST /{ig-user-id}/media_publish?creation_id=…
 *      Retried up to 5× with 3s delay on transient "media not ready"
 *      responses (codes 9007 / 2207027 / is_transient=true).
 *   3. GET /{media-id}?fields=permalink → public post URL
 *
 * Caption is truncated to 2200 chars (Instagram limit).
 *
 * Returns { success, mediaId, permalink, error } — never throws.
 */

const GRAPH_VERSION = "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const IG_CAPTION_MAX = 2200;
const PUBLISH_MAX_ATTEMPTS = 5;
const PUBLISH_RETRY_DELAY_MS = 3_000;

export interface InstagramPublishInput {
  igUserId: string;        // Instagram Business Account ID
  accessToken: string;     // Page access token (NOT user token)
  imageUrl: string;        // Public URL — must be HTTPS and reachable by Meta
  caption: string;
}

export interface InstagramPublishResult {
  success: boolean;
  mediaId?: string;
  permalink?: string | null;
  error?: string;
}

function truncateCaption(caption: string): string {
  if (caption.length <= IG_CAPTION_MAX) return caption;
  const trimmed = caption.substring(0, IG_CAPTION_MAX - 3) + "...";
  console.log(
    `[ig-publisher] Caption truncated ${caption.length} → ${trimmed.length}`
  );
  return trimmed;
}

function isTransient(err: { code?: number; error_subcode?: number; is_transient?: boolean }): boolean {
  return err.code === 9007 || err.error_subcode === 2207027 || err.is_transient === true;
}

function describeMetaError(err: { code?: number; error_subcode?: number; message?: string }): string {
  if (err.code === 190) {
    return "Instagram access token has expired. Reconnect the account in Integrations.";
  }
  if (err.code === 200) {
    return "Insufficient Instagram permissions. Reconnect with the correct scopes.";
  }
  if (err.code === 9004 || err.error_subcode === 2207052) {
    return "Instagram could not download the image URL. Use a publicly reachable HTTPS URL (Cloudinary, S3, etc.).";
  }
  return err.message ?? "Instagram publish failed";
}

async function createMediaContainer(
  igUserId: string,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<{ creationId?: string; error?: string }> {
  const url = `${GRAPH_BASE}/${igUserId}/media?image_url=${encodeURIComponent(
    imageUrl
  )}&caption=${encodeURIComponent(caption)}&access_token=${encodeURIComponent(accessToken)}`;

  const res = await fetch(url, { method: "POST" });
  const data = await res.json().catch(() => null) as
    | { id?: string; error?: { code?: number; error_subcode?: number; message?: string } }
    | null;

  if (!data) {
    return { error: "Instagram returned a non-JSON response on container create" };
  }
  if (data.error) {
    console.error("[ig-publisher] container create error:", data.error);
    return { error: describeMetaError(data.error) };
  }
  if (!data.id) {
    return { error: "Instagram did not return a creation ID" };
  }
  return { creationId: data.id };
}

async function publishMediaContainer(
  igUserId: string,
  accessToken: string,
  creationId: string
): Promise<{ mediaId?: string; error?: string }> {
  for (let attempt = 1; attempt <= PUBLISH_MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(
        `[ig-publisher] Waiting ${PUBLISH_RETRY_DELAY_MS}ms before retry ${attempt}/${PUBLISH_MAX_ATTEMPTS}`
      );
      await new Promise((r) => setTimeout(r, PUBLISH_RETRY_DELAY_MS));
    }

    const url = `${GRAPH_BASE}/${igUserId}/media_publish?creation_id=${encodeURIComponent(
      creationId
    )}&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url, { method: "POST" });
    const data = await res.json().catch(() => null) as
      | {
          id?: string;
          error?: { code?: number; error_subcode?: number; message?: string; is_transient?: boolean };
        }
      | null;

    if (!data) {
      return { error: "Instagram returned a non-JSON response on publish" };
    }
    if (data.id && !data.error) {
      console.log(`[ig-publisher] Published media ${data.id} (attempt ${attempt})`);
      return { mediaId: data.id };
    }
    if (data.error && isTransient(data.error)) {
      console.log(
        `[ig-publisher] Transient error on attempt ${attempt}/${PUBLISH_MAX_ATTEMPTS}:`,
        data.error
      );
      if (attempt >= PUBLISH_MAX_ATTEMPTS) {
        return {
          error: "Instagram is still processing the media after 5 retries. Try again in a minute.",
        };
      }
      continue;
    }
    if (data.error) {
      console.error("[ig-publisher] publish error:", data.error);
      return { error: describeMetaError(data.error) };
    }
    return { error: "Instagram returned no media ID and no error" };
  }
  return { error: "Instagram publish exhausted all retries" };
}

async function fetchPermalink(
  mediaId: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = (await res.json()) as { permalink?: string };
    if (!data.permalink) return null;
    const url = data.permalink.trim();
    return url.endsWith("/") ? url : `${url}/`;
  } catch (e) {
    console.warn("[ig-publisher] could not fetch permalink:", e);
    return null;
  }
}

export async function publishToInstagram(
  input: InstagramPublishInput
): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, imageUrl, caption } = input;

  if (!igUserId || !accessToken || !imageUrl) {
    return {
      success: false,
      error: "Missing igUserId, accessToken, or imageUrl",
    };
  }
  if (!/^https:\/\//.test(imageUrl)) {
    return {
      success: false,
      error: "Instagram requires an HTTPS image URL reachable from the public internet",
    };
  }

  const truncated = truncateCaption(caption);

  const container = await createMediaContainer(igUserId, accessToken, imageUrl, truncated);
  if (container.error || !container.creationId) {
    return { success: false, error: container.error ?? "Failed to create Instagram container" };
  }

  const publish = await publishMediaContainer(igUserId, accessToken, container.creationId);
  if (publish.error || !publish.mediaId) {
    return { success: false, error: publish.error ?? "Failed to publish Instagram media" };
  }

  const permalink = await fetchPermalink(publish.mediaId, accessToken);
  return { success: true, mediaId: publish.mediaId, permalink };
}
