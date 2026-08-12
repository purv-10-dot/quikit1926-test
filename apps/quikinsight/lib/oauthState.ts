import crypto from "crypto";

// Signed OAuth `state` for flows where the callback lands on a different host
// than the one the user is logged in on (e.g. Mailchimp, which forces a
// 127.0.0.1 loopback redirect and rejects "localhost"). Because cookies are
// host-bound, neither the NextAuth session nor a CSRF cookie is available at
// such a callback — so we carry the userId inside an HMAC-signed, time-limited
// state instead. Signed with NEXTAUTH_SECRET, so it can't be forged.

const SECRET = process.env.NEXTAUTH_SECRET ?? "";
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes, matching the old cookie TTL

export function signOAuthState(userId: string): string {
  const payload = `${userId}:${crypto.randomBytes(8).toString("hex")}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifyOAuthState(state: string | null | undefined): { userId: string } | null {
  if (!state || !SECRET) return null;

  const [payloadB64, sig] = state.split(".");
  if (!payloadB64 || !sig) return null;

  const payload = Buffer.from(payloadB64, "base64url").toString("utf8");
  const expected = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const [userId, , tsStr] = payload.split(":");
  const ts = Number(tsStr);
  if (!userId || !Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) return null;

  return { userId };
}
