/**
 * Post-login / post-handoff redirect sanitiser.
 *
 * Both the login page (`callbackUrl` query param) and the launcher hand-off
 * (`to` JWT claim) carry a destination supplied from outside the app, and both
 * feed it straight into a redirect. Anything that isn't a same-origin relative
 * path has to be rejected, otherwise a legitimate-looking QuikTrack sign-in link
 * can drop the user on an attacker's host after authentication (open redirect →
 * credential phishing).
 *
 * Rejected:
 *   - absolute URLs        `https://evil.test/x`, `javascript:alert(1)`
 *   - protocol-relative    `//evil.test/x`  (browsers treat this as absolute)
 *   - backslash variants   `/\evil.test`    (some parsers normalise `\` to `/`)
 *   - anything not starting with `/`
 */
export function safeInternalPath(raw: string | null | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  if (!raw.startsWith("/")) return fallback;
  // `//host` and `/\host` are both read as protocol-relative (i.e. off-origin).
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
