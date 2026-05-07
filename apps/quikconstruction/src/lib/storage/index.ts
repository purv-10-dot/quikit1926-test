/**
 * Storage module — public surface.
 *
 * Env-driven driver factory. Routes and services always import from here,
 * never from the concrete driver files.
 *
 *   import { getStorageDriver, fileService } from "@/lib/storage";
 *
 * Env vars consumed:
 *   STORAGE_DRIVER            = "s3" | "r2" | "local"    (default "local")
 *   STORAGE_BUCKET            = required for all drivers
 *
 *   # S3-specific:
 *   STORAGE_S3_REGION         = e.g. "ap-south-1"
 *   STORAGE_S3_ACCESS_KEY_ID
 *   STORAGE_S3_SECRET_ACCESS_KEY
 *
 *   # R2-specific (S3-compatible):
 *   STORAGE_R2_ACCOUNT_ID     = used to build the endpoint URL
 *   STORAGE_R2_ACCESS_KEY_ID
 *   STORAGE_R2_SECRET_ACCESS_KEY
 *   STORAGE_R2_ENDPOINT       = optional override
 *
 *   # Local driver (dev / LAN):
 *   STORAGE_LOCAL_DIR         = filesystem root (default ".storage/")
 *   STORAGE_LOCAL_BASE_URL    = base URL for upload/download routes (e.g. http://192.168.2.7:3010)
 *   STORAGE_LOCAL_SIGNING_SECRET = HMAC secret for signed tokens
 *
 *   # Common:
 *   STORAGE_UPLOAD_URL_TTL_SEC   = default 300
 *   STORAGE_DOWNLOAD_URL_TTL_SEC = default 300
 */

import path from "path";
import { S3Driver } from "./s3-driver";
import { LocalDriver } from "./local-driver";
import type { StorageDriver } from "./driver";

export type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";
export { S3Driver } from "./s3-driver";
export { LocalDriver } from "./local-driver";

let _driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (_driver) return _driver;

  const kind = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
  const bucket = process.env.STORAGE_BUCKET ?? "quikconstruction-dev";
  const uploadTtl = parseInt(process.env.STORAGE_UPLOAD_URL_TTL_SEC ?? "300", 10);
  const downloadTtl = parseInt(process.env.STORAGE_DOWNLOAD_URL_TTL_SEC ?? "300", 10);

  if (kind === "s3") {
    _driver = new S3Driver({
      kind: "s3",
      bucket,
      region: process.env.STORAGE_S3_REGION ?? "ap-south-1",
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? "",
      uploadUrlTtlSeconds: uploadTtl,
      downloadUrlTtlSeconds: downloadTtl,
    });
  } else if (kind === "r2") {
    const acct = process.env.STORAGE_R2_ACCOUNT_ID ?? "";
    const endpoint =
      process.env.STORAGE_R2_ENDPOINT ?? `https://${acct}.r2.cloudflarestorage.com`;
    _driver = new S3Driver({
      kind: "r2",
      bucket,
      region: "auto",
      endpoint,
      accessKeyId: process.env.STORAGE_R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.STORAGE_R2_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: true,
      uploadUrlTtlSeconds: uploadTtl,
      downloadUrlTtlSeconds: downloadTtl,
    });
  } else {
    const rootDir =
      process.env.STORAGE_LOCAL_DIR ??
      path.resolve(process.cwd(), ".storage");
    const baseUrl =
      process.env.STORAGE_LOCAL_BASE_URL ?? "http://localhost:3010";
    const signingSecret =
      process.env.STORAGE_LOCAL_SIGNING_SECRET ??
      process.env.NEXTAUTH_SECRET ??
      "insecure-dev-secret-change-me";
    _driver = new LocalDriver({
      bucket,
      rootDir,
      baseUrl,
      signingSecret,
      uploadUrlTtlSeconds: uploadTtl,
      downloadUrlTtlSeconds: downloadTtl,
    });
  }
  return _driver;
}

/** Test-only — reset the cached driver so tests can swap env vars. */
export function resetStorageDriver() {
  _driver = null;
}

export { fileService, FileService, FileError } from "./file-service";
export type { AttachmentEntityType, UploadInitResult } from "./file-service";
export { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from "./validation";
