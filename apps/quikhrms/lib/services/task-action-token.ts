import crypto from "crypto";
import { resolveTokenSecret } from "./token-secret";

// Stateless signed token for the per-assignee "mark this onboarding task done"
// link emailed to internal assignees (IT/Admin/etc.). No login / no DB column.
// Mirrors the doc-upload token, but also carries WHO the link is for so we can
// record completedBy without a session.
const SECRET = resolveTokenSecret("task-action-token", "dev-doc-upload-secret-change-me", process.env.TASK_ACTION_TOKEN_SECRET, process.env.DOC_UPLOAD_TOKEN_SECRET, process.env.NEXTAUTH_SECRET);
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

export interface TaskActionTokenPayload {
  taskId: string;
  orgId: string;
  employeeId: string; // the assignee this link was sent to
  exp: number; // epoch ms
}

export function generateTaskActionToken(taskId: string, orgId: string, employeeId: string): { token: string; expiresAt: Date } {
  const exp = Date.now() + EXPIRY_DAYS * 86400_000;
  const payload: TaskActionTokenPayload = { taskId, orgId, employeeId, exp };
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  return { token: `${body}.${sig}`, expiresAt: new Date(exp) };
}

export function verifyTaskActionToken(token: string): TaskActionTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64u(crypto.createHmac("sha256", SECRET).update(body).digest());
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(b64uDecode(body).toString("utf8")) as TaskActionTokenPayload;
    if (!payload.taskId || !payload.orgId || !payload.employeeId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}
