import crypto from "crypto";
import { resolveTokenSecret } from "./token-secret";

// Signed, self-contained token for the candidate "still interested?" links —
// mirrors feedback-token (HMAC-SHA256, no DB column needed).
const SECRET = resolveTokenSecret("reconfirm-token", "dev-feedback-secret-change-me", process.env.FEEDBACK_TOKEN_SECRET, process.env.NEXTAUTH_SECRET);
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

export interface ReconfirmTokenPayload {
  applicationId: string;
  orgId: string;
  exp: number; // epoch ms
}

export function generateReconfirmToken(applicationId: string, orgId: string): { token: string; expiresAt: Date } {
  const exp = Date.now() + EXPIRY_DAYS * 86400_000;
  const payload: ReconfirmTokenPayload = { applicationId, orgId, exp };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyReconfirmToken(token: string): ReconfirmTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(b64uDecode(body).toString("utf8")) as ReconfirmTokenPayload;
    if (!payload.applicationId || !payload.orgId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
