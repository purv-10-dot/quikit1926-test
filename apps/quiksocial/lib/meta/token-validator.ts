/**
 * Meta token validator — Graph API v24.0.
 *
 * Ported from v1 (reference-v1-latest/src/lib/social-media/token-validator.ts).
 * Validates a Facebook Page access token or Instagram Business Account access
 * token via /me. Detects Meta error codes 190 (expired) and 200 (permissions)
 * and surfaces them as `needsReconnect: true` so the UI can prompt the user.
 *
 * Never throws — every failure is reported in the result object.
 */

const GRAPH_VERSION = "v24.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface TokenValidationResult {
  valid: boolean;
  needsReconnect?: boolean;
  error?: string;
}

interface MetaErrorBody {
  error?: {
    code?: number;
    message?: string;
    error_subcode?: number;
    type?: string;
  };
}

function classifyError(err: NonNullable<MetaErrorBody["error"]>): TokenValidationResult {
  if (err.code === 190) {
    return {
      valid: false,
      needsReconnect: true,
      error: "Access token has expired. Reconnect the account.",
    };
  }
  if (err.code === 200) {
    return {
      valid: false,
      needsReconnect: true,
      error: "Insufficient permissions. Reconnect with the correct scopes.",
    };
  }
  return {
    valid: false,
    needsReconnect: true,
    error: err.message ?? "Token validation failed",
  };
}

/**
 * Validate a Facebook Page access token by calling /me.
 * The Page access token resolves /me to the Page itself.
 */
export async function validateFacebookToken(
  accessToken: string
): Promise<TokenValidationResult> {
  if (!accessToken) {
    return { valid: false, needsReconnect: true, error: "No access token provided" };
  }
  try {
    const res = await fetch(
      `${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = (await res.json().catch(() => null)) as MetaErrorBody | null;
    if (!data) {
      return { valid: false, error: "Facebook returned a non-JSON response" };
    }
    if (data.error) return classifyError(data.error);
    return { valid: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    return { valid: false, error: `Network error during validation: ${msg}` };
  }
}

/**
 * Validate an Instagram Business Account access token by reading the IG
 * account itself (not /me). The token is the Page access token bound to the
 * Page that owns the IG Business Account.
 */
export async function validateInstagramToken(
  accessToken: string,
  igUserId: string
): Promise<TokenValidationResult> {
  if (!accessToken || !igUserId) {
    return {
      valid: false,
      needsReconnect: true,
      error: "Missing access token or Instagram user ID",
    };
  }
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${igUserId}?fields=id,username&access_token=${encodeURIComponent(accessToken)}`
    );
    const data = (await res.json().catch(() => null)) as MetaErrorBody | null;
    if (!data) {
      return { valid: false, error: "Instagram returned a non-JSON response" };
    }
    if (data.error) return classifyError(data.error);
    return { valid: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "network error";
    return { valid: false, error: `Network error during validation: ${msg}` };
  }
}
