/**
 * Invite token generator.
 *
 * Tokens are:
 *   - 32 bytes of crypto-random hex (256 bits of entropy)
 *   - Stored plaintext on the user record for the demo-store case (in a
 *     real production build you'd store a SHA-256 hash instead so the
 *     DB breach doesn't immediately hand out valid tokens)
 *   - Single-use: verified → accepted → cleared
 *   - TTL: 72 hours by default, override via INVITE_TTL_HOURS env
 *
 * A valid token uniquely identifies ONE user account and ONE pending
 * invite. The accept-invite route walks the users collection looking
 * for a matching `inviteToken`, checks `inviteTokenExpires > now`, and
 * then sets the chosen password + clears the token.
 */

import { randomBytes } from "crypto";

const DEFAULT_TTL_HOURS = 72;

export interface InviteToken {
  token: string;
  expiresAt: string; // ISO timestamp
}

/** Generate a fresh single-use invite token with TTL. */
export function generateInviteToken(): InviteToken {
  const token = randomBytes(32).toString("hex");
  const ttlHours = Number(process.env.INVITE_TTL_HOURS) || DEFAULT_TTL_HOURS;
  const expires = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  return { token, expiresAt: expires.toISOString() };
}

/** Returns true if the stored token is still valid (not expired, not cleared). */
export function isTokenValid(user: {
  inviteToken?: string | null;
  inviteTokenExpires?: string | null;
}): boolean {
  if (!user.inviteToken || !user.inviteTokenExpires) return false;
  const expires = new Date(user.inviteTokenExpires).getTime();
  if (isNaN(expires)) return false;
  return expires > Date.now();
}

/** Human-friendly "invite expires in X hours" helper for the email copy. */
export function formatExpiryHint(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "already expired";
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 1) return "less than an hour";
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}
