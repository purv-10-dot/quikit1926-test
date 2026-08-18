/**
 * OAuth `state` — an HMAC-signed, tamper-evident round-trip token.
 *
 * The authorize route embeds { orgId, userId, provider } so the callback can
 * bind the returned tokens to the right org without trusting query params. The
 * signature (HMAC-SHA256 over the base64url body, keyed by NEXTAUTH_SECRET)
 * also serves as CSRF protection: a forged callback can't produce a valid one.
 */
import crypto from "node:crypto";

export interface OAuthState {
  orgId: string;
  userId: string;
  provider: string;
  nonce: string;
}

function secret(): string {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set — cannot sign OAuth state.");
  return s;
}

/** Produce a signed state string for { orgId, userId, provider }. */
export function signState(input: Omit<OAuthState, "nonce">): string {
  const payload: OAuthState = { ...input, nonce: crypto.randomBytes(8).toString("hex") };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify + decode a signed state string; throws on any tampering. */
export function verifyState(state: string): OAuthState {
  const [body, sig] = state.split(".");
  if (!body || !sig) throw new Error("Malformed OAuth state.");
  const expected = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("Invalid OAuth state signature.");
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
}
