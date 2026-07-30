import crypto from "crypto";
import { resolveTokenSecret } from "./token-secret";

// Signs the candidate-facing take-home submission link. Same HMAC scheme as the
// other tokenised candidate flows (doc-upload, feedback).
const SECRET = resolveTokenSecret("take-home-token", "dev-take-home-secret-change-me", process.env.TAKE_HOME_TOKEN_SECRET, process.env.NEXTAUTH_SECRET);
const EXPIRY_DAYS = 14;

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64uDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s, "base64");
}

export interface TakeHomeTokenPayload {
  interviewId: string;
  orgId: string;
  exp: number; // epoch ms
}

export function generateTakeHomeToken(interviewId: string, orgId: string): { token: string; expiresAt: Date } {
  const exp = Date.now() + EXPIRY_DAYS * 86400_000;
  const payload: TakeHomeTokenPayload = { interviewId, orgId, exp };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyTakeHomeToken(token: string): TakeHomeTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  try {
    const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = JSON.parse(b64uDecode(body).toString("utf8")) as TakeHomeTokenPayload;
    if (!payload.interviewId || !payload.orgId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
