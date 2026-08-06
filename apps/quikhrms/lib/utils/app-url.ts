/**
 * Base URL of THIS HRMS app — used to build absolute links in outgoing emails
 * (feedback, offers, doc/ack requests, task links, etc.).
 *
 * Resolution order (first non-empty wins), trailing slash stripped:
 *   1. NEXT_PUBLIC_QUIKHRMS_URL  ← the canonical HRMS app URL (set on every env)
 *   2. NEXT_PUBLIC_APP_URL       ← legacy fallback
 *   3. APP_URL                   ← server-only fallback
 *
 * QUIKHRMS_URL is primary so links always point at the HRMS app itself and
 * never bounce to the QuikIT launcher when APP_URL isn't set (e.g. UAT).
 */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_QUIKHRMS_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    ""
  ).replace(/\/$/, "");
}
