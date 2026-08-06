/**
 * Per-tab session tokens, kept in sessionStorage so each browser tab can hold
 * a different account (sessionStorage is not shared across tabs, unlike
 * cookies).
 *
 * Two tokens are stored:
 *  - access token (`hrms_token`): short-lived JWT, sent as Bearer header.
 *  - refresh token (`hrms_refresh`): long-lived, exchanged at /auth/refresh
 *    for a new pair when the access token expires.
 */
const TOKEN_KEY = "hrms_token";
const REFRESH_KEY = "hrms_refresh";

function write(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Clear BOTH tokens — used on logout, refresh failure, or session expiry. */
export function clearToken(): void {
  write(TOKEN_KEY, null);
  write(REFRESH_KEY, null);
}
