import crypto from "crypto";
import { resolveTokenSecret } from "./token-secret";

const SECRET = resolveTokenSecret("candidate-doc-token", "dev-candidate-doc-secret-change-me", process.env.CANDIDATE_DOC_TOKEN_SECRET, process.env.FEEDBACK_TOKEN_SECRET, process.env.NEXTAUTH_SECRET);
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

export interface CandidateDocTokenPayload {
  requestId: string;
  orgId: string;
  applicationId: string;
  bundle: "PreOffer" | "PostOffer";
  exp: number;
}

export function generateCandidateDocToken(payload: Omit<CandidateDocTokenPayload, "exp">): { token: string; expiresAt: Date } {
  const exp = Date.now() + EXPIRY_DAYS * 86400_000;
  const full: CandidateDocTokenPayload = { ...payload, exp };
  const body = b64u(Buffer.from(JSON.stringify(full)));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyCandidateDocToken(token: string): CandidateDocTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(b64uDecode(body).toString("utf8")) as CandidateDocTokenPayload;
    if (!payload.requestId || !payload.orgId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export const CANDIDATE_DOC_EXPIRY_DAYS = EXPIRY_DAYS;
