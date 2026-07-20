import { promises as fs } from "fs";
import path from "path";
import os from "os";

/**
 * Dev-only local-disk fallback for object storage.
 *
 * When Google Cloud Storage is unreachable in local development — blocked
 * network egress to storage.googleapis.com, missing creds, or a wrong system
 * clock breaking the TLS/JWT handshake — uploads are written here instead so
 * the image / file-attachment flows stay testable without cloud access.
 *
 * NEVER used in production: gated on NODE_ENV (serverless disks are ephemeral,
 * and prod must go through GCS). The upload route only falls back here AFTER a
 * GCS failure; the asset route only serves from here when a local copy exists,
 * so a working GCS setup is entirely unaffected.
 */
export const LOCAL_UPLOADS_ENABLED = process.env.NODE_ENV !== "production";

const ROOT = path.join(os.tmpdir(), "quiktrack-uploads");

function keyToLocalPath(key: string): string {
  // Keys are server-generated (tenants/<org>/quiktrack/...). Reject path
  // traversal defensively before touching the filesystem.
  if (key.includes("..") || path.isAbsolute(key)) {
    throw new Error("Invalid storage key");
  }
  return path.join(ROOT, key);
}

/** Persist an object + a sidecar file recording its content type. */
export async function putLocalObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const p = keyToLocalPath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, body);
  await fs.writeFile(`${p}.ct`, contentType || "application/octet-stream", "utf8");
}

/** Read a local object, or null if it doesn't exist here. */
export async function getLocalObject(
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let p: string;
  try {
    p = keyToLocalPath(key);
  } catch {
    return null;
  }
  try {
    const buffer = await fs.readFile(p);
    const contentType = await fs
      .readFile(`${p}.ct`, "utf8")
      .catch(() => "application/octet-stream");
    return { buffer, contentType };
  } catch {
    return null;
  }
}
