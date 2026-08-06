import crypto from "crypto";

/**
 * Invitation tokens: a random raw token is emailed to the invitee; only its
 * SHA-256 hash is stored in the DB. Lookups hash the incoming token and match
 * on the hash, so a DB leak never exposes a usable link.
 */
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashInviteToken(raw) };
}

function hashInviteToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Default validity window for an invitation. */
const INVITE_TTL_DAYS = 7;

export function inviteExpiry(days = INVITE_TTL_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
