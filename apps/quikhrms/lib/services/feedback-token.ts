import crypto from "crypto";

const SECRET = process.env.FEEDBACK_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || "dev-feedback-secret-change-me";
const EXPIRY_DAYS = 7;

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64uDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s, "base64");
}

export interface FeedbackTokenPayload {
  interviewId: string;
  orgId: string;
  exp: number; // epoch ms
}

export function generateFeedbackToken(interviewId: string, orgId: string): { token: string; expiresAt: Date } {
  const exp = Date.now() + EXPIRY_DAYS * 86400_000;
  const payload: FeedbackTokenPayload = { interviewId, orgId, exp };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyFeedbackToken(token: string): FeedbackTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(b64uDecode(body).toString("utf8")) as FeedbackTokenPayload;
    if (!payload.interviewId || !payload.orgId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
