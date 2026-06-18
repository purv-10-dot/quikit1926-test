/**
 * AWS S3 storage driver.
 *
 * Uploads use presigned PUT URLs (the browser PUTs the file body directly to
 * S3, keeping large files off the Next.js lambda); downloads use short-lived
 * presigned GET URLs. `putObject` covers server-side uploads (BOQ imports
 * parsed server-side, backend-generated PDFs).
 *
 * `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` are hard
 * dependencies — see package.json.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";

export interface S3DriverConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  uploadUrlTtlSeconds?: number;
  downloadUrlTtlSeconds?: number;
}

export class S3Driver implements StorageDriver {
  public readonly kind = "s3" as const;
  public readonly bucket: string;

  private cfg: S3DriverConfig;
  private client: S3Client;

  constructor(cfg: S3DriverConfig) {
    this.cfg = cfg;
    this.bucket = cfg.bucket;
    this.client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    const ttl = params.expiresIn ?? this.cfg.uploadUrlTtlSeconds ?? 300;
    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
    return {
      method: "PUT",
      url,
      headers: {
        "Content-Type": params.contentType,
        "Content-Length": String(params.contentLength),
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
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentDisposition: params.fileName
        ? `attachment; filename="${encodeURIComponent(params.fileName)}"`
        : undefined,
    });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttl });
    return { url, expiresIn: ttl };
  }

  async putObject(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      })
    );
  }

  async headObject(key: string) {
    try {
      const resp = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        exists: true,
        contentLength: resp.ContentLength,
        contentType: resp.ContentType,
        etag: resp.ETag?.replace(/"/g, ""),
      };
    } catch (err: unknown) {
      const s3err = err as { $metadata?: { httpStatusCode?: number }; name?: string };
      if (s3err.$metadata?.httpStatusCode === 404 || s3err.name === "NotFound") {
        return { exists: false };
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}
