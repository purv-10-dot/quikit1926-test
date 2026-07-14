/**
 * Google Cloud Storage driver — fully implemented, inert until env is set
 * (`STORAGE_DRIVER=gcs` or `GCS_BUCKET` + creds). Activates by env alone, no
 * code change. Uploads/downloads use v4 signed URLs so bytes never transit the
 * app. Tested via a mocked `@google-cloud/storage` (no real bucket/network).
 *
 * Credentials (support both forms):
 *   - GOOGLE_APPLICATION_CREDENTIALS  → path to a service-account key file
 *   - GCS_CREDENTIALS_JSON            → inline service-account JSON
 * Plus GCS_BUCKET and GCS_PROJECT_ID.
 */
import {
  buildObjectPath,
  isInlineType,
  type StorageDriver,
  type UploadTarget,
  type UploadTargetInput,
} from "./types";
import { randomUUID } from "node:crypto";

const UPLOAD_TTL_MS = 5 * 60_000;
const DOWNLOAD_TTL_MS = 10 * 60_000;

// Minimal shapes from @google-cloud/storage we depend on (kept loose so the
// module stays swappable and the mock is simple).
interface SignedUrlOptions {
  version: "v4";
  action: "read" | "write";
  expires: number;
  contentType?: string;
  extensionHeaders?: Record<string, string>;
  responseDisposition?: string;
  responseType?: string;
}
interface GcsFile {
  getSignedUrl(opts: SignedUrlOptions): Promise<[string]>;
  delete(): Promise<unknown>;
}
interface GcsBucket {
  file(path: string): GcsFile;
}

export class GcsDriver implements StorageDriver {
  private bucketPromise: Promise<GcsBucket> | null = null;

  private async bucket(): Promise<GcsBucket> {
    if (!this.bucketPromise) {
      this.bucketPromise = (async () => {
        const mod = (await import("@google-cloud/storage")) as unknown as {
          Storage: new (opts: Record<string, unknown>) => {
            bucket(name: string): GcsBucket;
          };
        };
        const opts: Record<string, unknown> = { projectId: process.env.GCS_PROJECT_ID };
        if (process.env.GCS_CREDENTIALS_JSON) {
          opts.credentials = JSON.parse(process.env.GCS_CREDENTIALS_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          opts.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        }
        const storage = new mod.Storage(opts);
        return storage.bucket(process.env.GCS_BUCKET!);
      })();
    }
    return this.bucketPromise;
  }

  async createUploadTarget(input: UploadTargetInput): Promise<UploadTarget> {
    const objectPath = buildObjectPath(input.orgId, input.channelId, randomUUID(), input.filename);
    const expires = Date.now() + UPLOAD_TTL_MS;
    const bucket = await this.bucket();
    const sizeRange = `0,${input.size}`;
    const [uploadUrl] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "write",
      expires,
      contentType: input.contentType,
      // Enforce the size server-side: the browser must send this exact header.
      extensionHeaders: { "x-goog-content-length-range": sizeRange },
    });
    return {
      uploadUrl,
      method: "PUT",
      headers: {
        "Content-Type": input.contentType,
        "x-goog-content-length-range": sizeRange,
      },
      objectPath,
      maxBytes: input.size,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  async createDownloadUrl(
    objectPath: string,
    opts?: { downloadName?: string; contentType?: string },
  ): Promise<string> {
    const bucket = await this.bucket();
    const disposition = isInlineType(opts?.contentType) ? "inline" : "attachment";
    const responseDisposition = opts?.downloadName
      ? `${disposition}; filename="${opts.downloadName.replace(/"/g, "")}"`
      : disposition;
    const [url] = await bucket.file(objectPath).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + DOWNLOAD_TTL_MS,
      responseDisposition,
      ...(opts?.contentType ? { responseType: opts.contentType } : {}),
    });
    return url;
  }

  async delete(objectPath: string): Promise<void> {
    const bucket = await this.bucket();
    await bucket.file(objectPath).delete();
  }
}
