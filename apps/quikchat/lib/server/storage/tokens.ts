/**
 * HMAC-signed, expiring tokens — the local driver's analog of a cloud signed
 * URL. A token is `base64url(payloadJson).base64url(hmacSha256(payloadJson))`.
 * Verification is timing-safe and rejects tampering + expiry.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@/lib/shared";

/**
 * The upload PUT's authorization token rides in this request header, not the
 * URL path. http.sys/IIS (the on-prem reverse proxy in front of this app)
 * rejects any URL segment over ~260 chars (`UrlSegmentMaxLength`) with a 400
 * before the request reaches the app; this token alone is ~450 chars. A
 * custom header (not `Authorization: Bearer`) avoids colliding with IIS
 * Windows Authentication or edge auth layers that specially interpret
 * `Authorization`. Query strings were considered and rejected too — they land
 * in every proxy access log along the way, and this token authorizes a write.
 */
export const UPLOAD_TOKEN_HEADER = "X-Upload-Token";

/**
 * The HMAC secret used to sign/verify upload + download tokens — shared by every
 * app-proxied storage driver (local + GCS) so both resolve the same secret from
 * one place. Dev fallback is intentional; production sets `UPLOAD_TOKEN_SECRET`
 * (and `instrumentation.ts` refuses to boot in production without it — this
 * fallback is reached only in dev/test, where we still warn once so it's never
 * silent).
 */
let warnedFallback = false;

export function uploadTokenSecret(): string {
  const secret = process.env.UPLOAD_TOKEN_SECRET;
  if (secret) return secret;
  if (!warnedFallback) {
    warnedFallback = true;
    logger.warn(
      "UPLOAD_TOKEN_SECRET is unset — signing upload/download tokens with a hardcoded dev secret",
    );
  }
  return "dev-only-upload-secret-change-me";
}

/** Test hook: drop the warn-once latch so a test can re-observe the warning. */
export function __resetUploadTokenSecretWarnForTest(): void {
  warnedFallback = false;
}

export interface UploadTokenPayload {
  kind: "up";
  objectPath: string;
  contentType: string;
  maxBytes: number;
  orgId: string;
  userId: string;
  exp: number; // epoch ms
}

export interface DownloadTokenPayload {
  kind: "down";
  objectPath: string;
  downloadName?: string;
  /** "inline" for media, "attachment" for files. */
  disposition: "inline" | "attachment";
  /** Content-Type to serve the bytes with. */
  contentType?: string;
  exp: number; // epoch ms
}

export type TokenPayload = UploadTokenPayload | DownloadTokenPayload;

const b64 = (buf: Buffer | string) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf, "utf8")).toString("base64url");

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

export function signToken(payload: TokenPayload, secret: string): string {
  const payloadB64 = b64(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify a token: signature, structure and expiry. Returns the typed payload or
 * `null` if anything is off (tampered, malformed, or expired).
 */
export function verifyToken<T extends TokenPayload = TokenPayload>(
  token: string,
  secret: string,
  now: number = Date.now(),
): T | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".", 2) as [string, string];
  if (!payloadB64 || !sigB64) return null;

  const expected = sign(payloadB64, secret);
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return null;
  }
  if (typeof payload?.exp !== "number" || payload.exp <= now) return null;
  return payload as T;
}
