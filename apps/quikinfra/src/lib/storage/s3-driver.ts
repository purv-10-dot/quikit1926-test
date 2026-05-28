/**
 * S3 / Cloudflare R2 driver.
 *
 * R2 is S3-compatible on the wire, so one driver handles both — the only
 * difference is the endpoint and the region (`auto` for R2). The `kind`
 * field lets callers log which backend they're talking to.
 *
 * AWS SDK v3 is loaded dynamically so builds don't fail when the package
 * isn't installed yet (dev environments on the local driver). If you need
 * S3/R2 in production, add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`
 * to package.json first.
 */

import type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";

export interface S3DriverConfig {
  kind: "s3" | "r2";
  bucket: string;
  region: string;
  endpoint?: string;        // required for R2 (e.g. https://<account>.r2.cloudflarestorage.com)
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean; // true for R2 and MinIO
  uploadUrlTtlSeconds?: number;
  downloadUrlTtlSeconds?: number;
}

export class S3Driver implements StorageDriver {
  public readonly kind: "s3" | "r2";
  public readonly bucket: string;

  private cfg: S3DriverConfig;
  private client: any = null;
  private presigner: any = null;
  private sdkLoaded = false;

  constructor(cfg: S3DriverConfig) {
    this.cfg = cfg;
    this.kind = cfg.kind;
    this.bucket = cfg.bucket;
  }

  /**
   * Load the AWS SDK on first use. Uses indirect `Function` evaluation so
   * webpack can't statically detect the import and try to bundle the SDK.
   * This keeps the optional dependency truly optional — builds succeed even
   * when `@aws-sdk/client-s3` is not installed, and the driver throws a
   * clear error only at runtime when someone actually tries to use it.
   */
  private async loadSdk() {
    if (this.sdkLoaded) return;

    // Hidden from webpack's static analyzer
    const dynImport = new Function("m", "return import(m)") as (m: string) => Promise<any>;

    let clientMod: any;
    let presignerMod: any;
    try {
      clientMod = await dynImport("@aws-sdk/client-s3");
    } catch {
      throw new Error(
        "S3 driver requires `@aws-sdk/client-s3`. Install it with " +
          "`pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`, or switch STORAGE_DRIVER=local."
      );
    }
    try {
      presignerMod = await dynImport("@aws-sdk/s3-request-presigner");
    } catch {
      throw new Error(
        "S3 driver requires `@aws-sdk/s3-request-presigner`. " +
          "Install it or switch STORAGE_DRIVER=local."
      );
    }

    const {
      S3Client,
      PutObjectCommand,
      GetObjectCommand,
      HeadObjectCommand,
      DeleteObjectCommand,
    } = clientMod;
    const { getSignedUrl } = presignerMod;

    this.client = new S3Client({
      region: this.cfg.region,
      endpoint: this.cfg.endpoint,
      credentials: {
        accessKeyId: this.cfg.accessKeyId,
        secretAccessKey: this.cfg.secretAccessKey,
      },
      forcePathStyle: this.cfg.forcePathStyle ?? this.cfg.kind === "r2",
    });

    this.presigner = {
      getSignedUrl,
      PutObjectCommand,
      GetObjectCommand,
      HeadObjectCommand,
      DeleteObjectCommand,
    };
    this.sdkLoaded = true;
  }

  async getPresignedUploadUrl(params: {
    key: string;
    contentType: string;
    contentLength: number;
    expiresIn?: number;
  }): Promise<PresignedUploadUrl> {
    await this.loadSdk();
    const ttl = params.expiresIn ?? this.cfg.uploadUrlTtlSeconds ?? 300;
    const cmd = new this.presigner.PutObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
    });
    const url = await this.presigner.getSignedUrl(this.client, cmd, { expiresIn: ttl });
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
    await this.loadSdk();
    const ttl = params.expiresIn ?? this.cfg.downloadUrlTtlSeconds ?? 300;
    const cmd = new this.presigner.GetObjectCommand({
      Bucket: this.bucket,
      Key: params.key,
      ResponseContentDisposition: params.fileName
        ? `attachment; filename="${encodeURIComponent(params.fileName)}"`
        : undefined,
    });
    const url = await this.presigner.getSignedUrl(this.client, cmd, { expiresIn: ttl });
    return { url, expiresIn: ttl };
  }

  async putObject(params: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }): Promise<void> {
    await this.loadSdk();
    await this.client.send(
      new this.presigner.PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      })
    );
  }

  async headObject(key: string) {
    await this.loadSdk();
    try {
      const resp = await this.client.send(
        new this.presigner.HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return {
        exists: true,
        contentLength: resp.ContentLength,
        contentType: resp.ContentType,
        etag: resp.ETag?.replace(/"/g, ""),
      };
    } catch (err: any) {
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") {
        return { exists: false };
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.loadSdk();
    await this.client.send(
      new this.presigner.DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }
}
