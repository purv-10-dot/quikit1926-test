/**
 * OAuth state signing for the Integrations flow.
 *
 * Carries (userId, brandId, platform) through the third-party OAuth round-trip
 * since the callback has no NextAuth session to read from. HMAC-signed with
 * NEXTAUTH_SECRET so an attacker can't forge a state with a different userId.
 *
 * Ported from quiksocial-v2 verbatim except for:
 *   - appUrl() default → localhost:3007 (QuikSocial's port in QuikIT)
 *
 * TODO(integration): the state should also carry orgId so the callback
 * doesn't need to fall back to DEFAULT_ORG_ID. Adding orgId to OAuthState
 * is a follow-up PR — strictly additive, no signature break.
 */

import { createHmac } from "crypto";

interface OAuthState {
  userId: string;
  brandId: string;
  platform: string;
}

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? "qs-oauth-fallback";
}

export function signState(data: OAuthState): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): OAuthState | null {
  try {
    const dot = state.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
    if (sig !== expected) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as OAuthState;
  } catch {
    return null;
  }
}

export function appUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3007"
  );
}
