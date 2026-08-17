/**
 * Local storage driver — the active default until QuikIT GCS credentials land.
 * It mirrors the direct-to-storage flow so the client is identical: the "signed
 * URL" is an app endpoint guarded by an HMAC token. Upload PUTs go to the fixed
 * `/api/uploads/local` with the token in the `X-Upload-Token` header (see
 * UPLOAD_TOKEN_HEADER); downloads still carry their token as a path segment
 * (`/api/uploads/local/{token}`) since they're consumed by plain `<img>`/`<a>`/
 * `<video>` src/href, which can't attach custom headers — a download token
 * long enough to hit the same proxy 260-char limit is a latent risk, not fixed
 * here (would need those call sites reworked to fetch+blob-URL). INTERIM ONLY:
 * on ephemeral hosts files don't survive a redeploy.
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
import { signToken, uploadTokenSecret, UPLOAD_TOKEN_HEADER } from "./tokens";

const UPLOAD_TTL_MS = 5 * 60_000; // 5 min
const DOWNLOAD_TTL_MS = 10 * 60_000; // 10 min

function secret(): string {
  return uploadTokenSecret();
}

/**
 * The HMAC secret used to sign/verify upload + download tokens. Retained as a
 * thin re-export (the accessor now lives in `tokens.ts`, shared with the GCS
 * driver) so existing importers of `localUploadSecret` stay unchanged.
 */
export function localUploadSecret(): string {
  return uploadTokenSecret();
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
      uploadUrl: `/api/uploads/local`,
      method: "PUT",
      headers: { "Content-Type": input.contentType, [UPLOAD_TOKEN_HEADER]: token },
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
