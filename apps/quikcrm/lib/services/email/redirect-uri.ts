import { env } from "@/lib/env";

/**
 * The OAuth callback URI. Must EXACTLY match the redirect URI registered with
 * Google / Microsoft — Azure rejects any query-string difference (AADSTS50011),
 * so the provider is NOT encoded here. The initiating provider is carried in
 * the signed `state` instead and read back on callback. Base comes from
 * MAILBOX_OAUTH_REDIRECT_BASE (set explicitly in prod) or falls back to
 * NEXT_PUBLIC_APP_URL for local dev.
 */
export function callbackUri(): string {
  const e = env();
  const base = (e.MAILBOX_OAUTH_REDIRECT_BASE || e.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
  return `${base}/api/email/mailbox/callback`;
}

/** Absolute URL to the Settings → Email page, for post-connect redirects. */
export function settingsEmailUrl(query = ""): string {
  const e = env();
  const base = (e.MAILBOX_OAUTH_REDIRECT_BASE || e.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
  return `${base}/settings/email${query}`;
}
