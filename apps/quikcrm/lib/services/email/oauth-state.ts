/**
 * OAuth `state` param: signed to prevent CSRF and to carry the initiating
 * user's identity across the provider round-trip WITHOUT trusting the browser.
 *
 * The state encodes { userId, orgId, provider, nonce, iat } and is HMAC-signed
 * with NEXTAUTH_SECRET (already required app-wide). On callback we re-verify the
 * signature (constant-time) and expiry before touching any token — the callback
 * never trusts a userId/orgId from the query string, only from the verified state.
 *
 * Node `crypto` only — no new dependency.
 */

import { createHmac, timingSafeEqual } from "crypto";

export interface OAuthStatePayload {
  userId: string;
  orgId: string;
  provider: "gmail" | "microsoft";
  nonce: string;
  iat: number; // epoch ms
}

const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes to complete consent

export class OAuthStateError extends Error {
  statusCode = 400;
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new OAuthStateError("NEXTAUTH_SECRET is not set — cannot sign OAuth state.");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function sign(dataB64: string): string {
  return createHmac("sha256", secret()).update(dataB64).digest("base64url");
}

/** Produce a signed state string: `<payloadB64url>.<sigB64url>`. */
export function signState(payload: Omit<OAuthStatePayload, "iat">): string {
  const full: OAuthStatePayload = { ...payload, iat: Date.now() };
  const dataB64 = b64url(Buffer.from(JSON.stringify(full), "utf8"));
  return `${dataB64}.${sign(dataB64)}`;
}

/**
 * Verify signature + expiry and return the payload. Throws OAuthStateError on
 * any mismatch, malformation, or expiry. Callers MUST use the returned
 * userId/orgId — never values from the raw query string.
 */
export function verifyState(state: string): OAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2) throw new OAuthStateError("Malformed OAuth state.");
  const [dataB64, sig] = parts;

  const expected = sign(dataB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new OAuthStateError("OAuth state signature is invalid.");
  }

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8"));
  } catch {
    throw new OAuthStateError("OAuth state payload is unreadable.");
  }

  if (!payload.userId || !payload.orgId || !payload.provider) {
    throw new OAuthStateError("OAuth state is missing required fields.");
  }
  if (typeof payload.iat !== "number" || Date.now() - payload.iat > MAX_AGE_MS) {
    throw new OAuthStateError("OAuth state has expired — please retry the connection.");
  }
  return payload;
}
