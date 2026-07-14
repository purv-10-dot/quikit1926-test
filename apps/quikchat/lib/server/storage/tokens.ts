/**
 * HMAC-signed, expiring tokens — the local driver's analog of a cloud signed
 * URL. A token is `base64url(payloadJson).base64url(hmacSha256(payloadJson))`.
 * Verification is timing-safe and rejects tampering + expiry.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

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
