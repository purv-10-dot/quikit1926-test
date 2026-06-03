/**
 * Public origin of this QuikScale app, used to build absolute URLs inside
 * transactional emails (the "View KPI" / "View Priority" / "View WWW"
 * buttons). Single source of truth — change the env-var precedence here
 * and every notification service picks it up.
 *
 * Precedence:
 *   1. APP_URL       — primary, dedicated to email links
 *   2. NEXTAUTH_URL  — fallback, already set in every deployment for auth
 *   3. ""            — no base URL (callers should treat as "skip the link")
 *
 * Per-env values live in:
 *   - `.env`        — local default (http://localhost:3003)
 *   - `.env.local`  — per-developer override (git-ignored)
 *   - Vercel dashboard — UAT / production
 *
 * Trailing slash is stripped so callers can write `${getAppBaseUrl()}/kpi`
 * without producing `//kpi`.
 */
export function getAppBaseUrl(): string {
  return (process.env.APP_URL || process.env.NEXTAUTH_URL || "").replace(/\/$/, "");
}
