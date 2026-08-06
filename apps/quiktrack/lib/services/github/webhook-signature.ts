import { createHmac } from "crypto";
import { safeSecretEqual } from "@/lib/secret-compare";

/**
 * Verify the HMAC signature GitHub attaches to every webhook delivery.
 *
 * GitHub signs the raw request body with the App's webhook secret and sends the
 * result in the `X-Hub-Signature-256` header as `sha256=<hex>`. We recompute the
 * HMAC over the *raw* body (not a re-serialized JSON — key order / whitespace
 * would change the bytes) and compare in constant time. Any request that fails
 * this check must be rejected with 401 before its payload is trusted.
 *
 * Fail-closed: returns false for a missing header, missing/empty secret, wrong
 * prefix, or any mismatch. Uses only Node built-in `crypto`.
 *
 * @param rawBody  the exact request body bytes/string as received
 * @param signatureHeader  value of the `X-Hub-Signature-256` header
 * @param secret  the App's configured webhook secret
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!signatureHeader || !secret) return false;

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const expected =
    prefix + createHmac("sha256", secret).update(rawBody).digest("hex");

  // Constant-time compare (the shared helper hashes both sides, so unequal
  // lengths neither throw nor leak).
  return safeSecretEqual(signatureHeader, expected);
}

/**
 * Convenience: read the webhook secret from the environment and verify.
 * Returns false (fail-closed) when `GITHUB_APP_WEBHOOK_SECRET` is unset so an
 * unconfigured deployment rejects deliveries rather than accepting them blindly.
 */
export function verifyWebhookSignatureFromEnv(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
): boolean {
  return verifyWebhookSignature(
    rawBody,
    signatureHeader,
    process.env.GITHUB_APP_WEBHOOK_SECRET,
  );
}
