/**
 * Google Cloud Storage driver.
 *
 * Uploads use signed (V4) PUT URLs (the browser PUTs the file body directly to
 * GCS, keeping large files off the Next.js lambda); downloads use short-lived
 * signed (V4) GET URLs. `putObject` covers server-side uploads (BOQ imports
 * parsed server-side, backend-generated PDFs).
 *
 * GCS V4 write signing binds the `Content-Type`: the client PUT must send the
 * exact same `Content-Type` header that was signed, so it is returned in
 * `headers`. Content-Length is not part of the signature.
 *
 * `@google-cloud/storage` is a hard dependency — see package.json.
 */

import { Storage, type Bucket } from "@google-cloud/storage";
import type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";

export interface GcsDriverConfig {
  bucket: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
  uploadUrlTtlSeconds?: number;
  downloadUrlTtlSeconds?: number;
}

export class GcsDriver implements StorageDriver {
  public readonly kind = "gcs" as const;
  public readonly bucket: string;

  private cfg: GcsDriverConfig;
  private client: Storage;

  constructor(cfg: GcsDriverConfig) {
    this.cfg = cfg;
    this.bucket = cfg.bucket;
    this.client = new Storage({
      projectId: cfg.projectId,
      credentials: {
        client_email: cfg.clientEmail,
        private_key: cfg.privateKey,
      },
    });
  }

  private bucketRef(): Bucket {
    return this.client.bucket(this.bucket);
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    const ttl = params.expiresIn ?? this.cfg.uploadUrlTtlSeconds ?? 300;
    const [url] = await this.bucketRef()
      .file(params.key)
      .getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + ttl * 1000,
        contentType: params.contentType,
      });
    return {
      method: "PUT",
      url,
      headers: {
        "Content-Type": params.contentType,
      },
      expiresIn: ttl,
    };
  }

  async getPresignedDownloadUrl(params: {
    key: string;
    fileName?: string;
    expiresIn?: number;
  }): Promise<PresignedDownloadUrl> {
    const ttl = params.expiresIn ?? this.cfg.downloadUrlTtlSeconds ?? 300;
    const [url] = await this.bucketRef()
      .file(params.key)
      .getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + ttl * 1000,
        ...(params.fileName
          ? {
              responseDisposition: `attachment; filename="${encodeURIComponent(params.fileName)}"`,
            }
          : {}),
      });
    return { url, expiresIn: ttl };
  }

  async putObject(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<void> {
    await this.bucketRef().file(params.key).save(Buffer.from(params.body), {
      contentType: params.contentType,
      resumable: false,
    });
  }

  async headObject(key: string) {
    const file = this.bucketRef().file(key);
    const [exists] = await file.exists();
    if (!exists) return { exists: false };
    const [md] = await file.getMetadata();
    return {
      exists: true,
      contentLength: md.size !== undefined ? Number(md.size) : undefined,
      contentType: md.contentType,
      etag: md.etag?.replace(/"/g, ""),
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.bucketRef().file(key).delete();
  }
}
