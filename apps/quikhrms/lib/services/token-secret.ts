/**
 * Resolves the HMAC secret for a stateless magic-link token signer.
 *
 * Order: the first non-empty env var wins. If NONE are set:
 *  - in production → THROW (fail closed; never sign/verify with a public
 *    hardcoded default that an attacker could use to forge valid tokens),
 *  - outside production → fall back to a clearly-labelled dev default so local
 *    tooling keeps working.
 *
 * Called at module load in each signer, so a misconfigured production deploy
 * refuses to serve token-gated routes instead of silently accepting forgeries.
 */
export function resolveTokenSecret(label: string, devFallback: string, ...envVars: (string | undefined)[]): string {
  const found = envVars.find((v) => v && v.trim());
  if (found) return found;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[${label}] token secret is required in production — set the dedicated env var (or NEXTAUTH_SECRET). Refusing the hardcoded dev fallback.`,
    );
  }
  return devFallback;
}
