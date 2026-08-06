import crypto from "crypto";
import { resolveTokenSecret } from "./token-secret";

// Stateless signed token for the public candidate document-upload page (no
// login / no DB column). Mirrors the exit-interview / offer-response tokens.
const SECRET = resolveTokenSecret("doc-upload-token", "dev-doc-upload-secret-change-me", process.env.DOC_UPLOAD_TOKEN_SECRET, process.env.NEXTAUTH_SECRET);
const EXPIRY_DAYS = 30;

function b64u(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64uDecode(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  if (pad) s += "=".repeat(4 - pad);
  return Buffer.from(s, "base64");
}

export interface DocUploadTokenPayload {
  taskId: string;
  orgId: string;
  exp: number; // epoch ms
}

export function generateDocUploadToken(taskId: string, orgId: string): { token: string; expiresAt: Date } {
  const exp = Date.now() + EXPIRY_DAYS * 86400_000;
  const payload: DocUploadTokenPayload = { taskId, orgId, exp };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyDocUploadToken(token: string): DocUploadTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(b64uDecode(body).toString("utf8")) as DocUploadTokenPayload;
    if (!payload.taskId || !payload.orgId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
