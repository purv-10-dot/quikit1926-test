/**
 * Google Cloud Storage driver — fully implemented, inert until env is set
 * (`STORAGE_DRIVER=gcs` or `GCS_BUCKET` + creds). Activates by env alone, no
 * code change. Uploads are proxied through the app (browser → `/api/uploads/gcs/
 * {token}` → this driver's `save`) so no bucket CORS is needed — matching the
 * platform pattern (quiktrack/quikhrms/quikcrm) and the interim local driver.
 * Downloads still use a v4 signed-GET URL the browser hits directly. Tested via
 * a mocked `@google-cloud/storage` (no real bucket/network).
 *
 * Credentials (support three forms):
 *   - GCS_CREDENTIALS_JSON            → inline service-account JSON
 *   - GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY → split service-account creds
 *                                          (private key \n-unescaped; matches
 *                                          quiktrack/quikhrms/quikcrm/quikinfra)
 *   - GOOGLE_APPLICATION_CREDENTIALS  → path to a service-account key file
 * Plus GCS_BUCKET and GCS_PROJECT_ID.
 */
import {
  buildObjectPath,
  isInlineType,
  type StorageDriver,
  type UploadTarget,
  type UploadTargetInput,
} from "./types";
import { signToken, uploadTokenSecret } from "./tokens";
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
interface GcsSaveOptions {
  contentType?: string;
  resumable?: boolean;
  metadata?: Record<string, unknown>;
}
interface GcsFile {
  getSignedUrl(opts: SignedUrlOptions): Promise<[string]>;
  save(data: Buffer, opts?: GcsSaveOptions): Promise<unknown>;
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
        } else if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
          opts.credentials = {
            client_email: process.env.GCS_CLIENT_EMAIL,
            private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, "\n"),
          };
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
    // Route the browser PUT through an app endpoint (not a direct-to-GCS signed
    // write URL) so no bucket CORS is needed — mirrors LocalDriver. The HMAC
    // token is the authorization; `write()` (below) pushes the bytes to GCS.
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
      uploadTokenSecret(),
    );
    return {
      uploadUrl: `/api/uploads/gcs/${token}`,
      method: "PUT",
      headers: { "Content-Type": input.contentType },
      objectPath,
      maxBytes: input.size,
      expiresAt: new Date(exp).toISOString(),
    };
  }

  /** Persist bytes for a verified upload. Called by the PUT route. */
  async write(objectPath: string, body: Buffer, contentType: string): Promise<void> {
    const bucket = await this.bucket();
    await bucket.file(objectPath).save(Buffer.from(body), {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=300" },
    });
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
