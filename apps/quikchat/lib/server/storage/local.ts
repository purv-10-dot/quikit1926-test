/**
 * Local storage driver — the active default until QuikIT GCS credentials land.
 * It mirrors the direct-to-storage flow so the client is identical: the "signed
 * URL" is an app endpoint (`/api/uploads/local/{token}`) guarded by an HMAC
 * token. INTERIM ONLY: on ephemeral hosts files don't survive a redeploy.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildObjectPath,
  isInlineType,
  type StorageDriver,
  type UploadTarget,
  type UploadTargetInput,
} from "./types";
import { signToken } from "./tokens";

const UPLOAD_TTL_MS = 5 * 60_000; // 5 min
const DOWNLOAD_TTL_MS = 10 * 60_000; // 10 min

function secret(): string {
  return process.env.UPLOAD_TOKEN_SECRET || "dev-only-upload-secret-change-me";
}

/** The HMAC secret used to sign/verify local upload + download tokens. */
export function localUploadSecret(): string {
  return secret();
}

export function uploadDir(): string {
  return resolve(process.env.LOCAL_UPLOAD_DIR || "./.uploads");
}

/** Resolve an objectPath to an absolute fs path, refusing traversal. */
export function fsPathFor(objectPath: string): string {
  const root = uploadDir();
  const full = resolve(join(root, objectPath));
  if (full !== root && !full.startsWith(root + sep)) {
    throw new Error("Invalid object path");
  }
  return full;
}

export class LocalDriver implements StorageDriver {
  async createUploadTarget(input: UploadTargetInput): Promise<UploadTarget> {
    const objectPath = buildObjectPath(input.orgId, input.channelId, randomUUID(), input.filename);
    const exp = Date.now() + UPLOAD_TTL_MS;
    const token = signToken(
      {
        kind: "up",
        objectPath,
        contentType: input.contentType,
        maxBytes: input.size > 0 ? input.size : Number.MAX_SAFE_INTEGER,
        orgId: input.orgId,
        userId: input.userId,
        exp,
      },
      secret(),
    );
    return {
      uploadUrl: `/api/uploads/local/${token}`,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      objectPath,
      maxBytes: input.size,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  async createDownloadUrl(
    objectPath: string,
    opts?: { downloadName?: string; contentType?: string },
  ): Promise<string> {
    const token = signToken(
      {
        kind: "down",
        objectPath,
        downloadName: opts?.downloadName,
        disposition: isInlineType(opts?.contentType) ? "inline" : "attachment",
        contentType: opts?.contentType,
        exp: Date.now() + DOWNLOAD_TTL_MS,
      },
      secret(),
    );
    return `/api/uploads/local/${token}`;
  }

  /** Persist bytes for a verified upload. Called by the PUT route. */
  async write(objectPath: string, body: Buffer): Promise<void> {
    const full = fsPathFor(objectPath);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  /** Read bytes for a verified download. Called by the GET route. */
  async read(objectPath: string): Promise<Buffer> {
    return readFile(fsPathFor(objectPath));
  }

  uploadSecret(): string {
    return secret();
  }
}
