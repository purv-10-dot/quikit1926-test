/**
 * HMAC-signed invite tokens for /invite/accept links.
 *
 * Format: `<base64url(payload)>.<base64url(hmac)>`
 *   payload = { email, inviteId, exp }
 *   hmac    = HMAC-SHA256(payload, NEXTAUTH_SECRET)
 *
 * The token is bearer-only — anyone with the link can present it. That's
 * intentional for invite-by-link UX. Verification checks the signature and
 * `exp` (7-day TTL), and the API additionally checks the matching
 * ApprovalInvite is still `pending` and that the logged-in session email
 * matches the invite.
 */

import crypto from "crypto";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface InviteTokenPayload {
  email: string;
  inviteId: string;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required to sign invite tokens");
  }
  return secret;
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payloadB64: string, secret: string): string {
  return b64urlEncode(
    crypto.createHmac("sha256", secret).update(payloadB64).digest()
  );
}

/** Generate a signed invite token good for 7 days. */
export function generateInviteToken(email: string, inviteId: string): string {
  const payload: InviteTokenPayload = {
    email: email.toLowerCase().trim(),
    inviteId,
    exp: Date.now() + SEVEN_DAYS_MS,
  };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = sign(payloadB64, getSecret());
  return `${payloadB64}.${sig}`;
}

/**
 * Verify an invite token. Returns the payload on success, null on any
 * failure (malformed, bad signature, expired). Uses a constant-time
 * comparison on the signature.
 */
export function verifyInviteToken(
  token: string
): { email: string; inviteId: string } | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return null;
  }

  const expected = sign(payloadB64, secret);
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;

  let parsed: InviteTokenPayload;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed.email !== "string" ||
    typeof parsed.inviteId !== "string" ||
    typeof parsed.exp !== "number"
  ) {
    return null;
  }

  if (parsed.exp < Date.now()) return null;

  return { email: parsed.email.toLowerCase().trim(), inviteId: parsed.inviteId };
}
