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
 *   # S3-specific (STORAGE_S3_* take priority; AWS_* are the fallback aliases
 *   # shared with quiktrack / Quikcrm — set either set, not both):
 *   STORAGE_S3_REGION / AWS_REGION                      = e.g. "ap-south-1"
 *   STORAGE_S3_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID
 *   STORAGE_S3_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY
 *   STORAGE_BUCKET / AWS_S3_BUCKET                       = bucket name
 *   # With no STORAGE_DRIVER set, the factory auto-selects s3 when AWS_* creds
 *   # are present (otherwise local).
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

  // Plain AWS_* env vars — the same convention quiktrack / Quikcrm use, so a
  // single S3 credentials block works across every app. STORAGE_S3_* below
  // still wins if set, for callers that want app-specific overrides.
  const awsRegion = process.env.AWS_REGION;
  const awsBucket = process.env.AWS_S3_BUCKET;
  const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;
  const hasAwsCreds = Boolean(awsKeyId && awsSecret && awsBucket);

  // Explicit STORAGE_DRIVER wins; otherwise default to s3 when AWS_* creds are
  // present (quiktrack convention), else the local filesystem driver.
  const kind = (process.env.STORAGE_DRIVER ?? (hasAwsCreds ? "s3" : "local")).toLowerCase();
  const bucket = process.env.STORAGE_BUCKET ?? awsBucket ?? "quikinfra-dev";
  const uploadTtl = parseInt(process.env.STORAGE_UPLOAD_URL_TTL_SEC ?? "300", 10);
  const downloadTtl = parseInt(process.env.STORAGE_DOWNLOAD_URL_TTL_SEC ?? "300", 10);

  if (kind === "s3") {
    _driver = new S3Driver({
      kind: "s3",
      bucket,
      region: process.env.STORAGE_S3_REGION ?? awsRegion ?? "ap-south-1",
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? awsKeyId ?? "",
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? awsSecret ?? "",
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
