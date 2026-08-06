/**
 * Google Cloud Storage access, shared by every QuikIT app.
 *
 * Ported from `apps/quikinfra/lib/storage/` — QuikInfra had the only working
 * GCS integration, and Contact Support now needs the same thing in fourteen
 * apps. Rather than copy the driver thirteen more times it lives here; QuikInfra
 * keeps its own richer module (presigned PUT flow, file metadata table, per-
 * entity size caps) because it has requirements this doesn't.
 *
 * Only the operations the shared features actually need are exposed:
 * server-side upload, existence check, signed download, delete. The presigned-
 * PUT flow is deliberately absent — support attachments are screenshots, small
 * enough to stream through the lambda, and the direct-PUT flow needs a second
 * confirm round-trip plus a metadata state machine to be safe.
 *
 * Env vars consumed (identical names to QuikInfra, so an app that already has
 * them configured needs no new configuration):
 *
 *   GCS_PROJECT_ID    = GCP project id
 *   GCS_BUCKET        = bucket name
 *   GCS_CLIENT_EMAIL  = service-account email
 *   GCS_PRIVATE_KEY   = service-account private key (escaped \n newlines)
 *   STORAGE_DOWNLOAD_URL_TTL_SEC = default 300
 *
 * SERVER ONLY. Not re-exported from packages/shared/index.ts — it stays on the
 * `@quikit/shared/storage` subpath so `@google-cloud/storage` never reaches a
 * client bundle. Same rule as `apiLogging.ts`.
 */

import { Storage, type Bucket } from "@google-cloud/storage";

export interface GcsConfig {
  bucket: string;
  projectId: string;
  clientEmail: string;
  privateKey: string;
  downloadUrlTtlSeconds: number;
}

/** Thrown when the app is missing GCS configuration. */
export class StorageNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Google Cloud Storage is not configured — missing ${missing.join(", ")}. ` +
        `File uploads are unavailable until these are set.`,
    );
    this.name = "StorageNotConfiguredError";
  }
}

let _config: GcsConfig | null = null;
let _client: Storage | null = null;

function readConfig(): GcsConfig {
  if (_config) return _config;

  const bucket = process.env.GCS_BUCKET ?? "";
  const projectId = process.env.GCS_PROJECT_ID ?? "";
  const clientEmail = process.env.GCS_CLIENT_EMAIL ?? "";
  // Env files carry the key with literal `\n` escapes; the SDK needs real ones.
  const privateKey = (process.env.GCS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");

  const missing: string[] = [];
  if (!bucket) missing.push("GCS_BUCKET");
  if (!projectId) missing.push("GCS_PROJECT_ID");
  if (!clientEmail) missing.push("GCS_CLIENT_EMAIL");
  if (!privateKey) missing.push("GCS_PRIVATE_KEY");
  if (missing.length > 0) throw new StorageNotConfiguredError(missing);

  _config = {
    bucket,
    projectId,
    clientEmail,
    privateKey,
    downloadUrlTtlSeconds: parseInt(process.env.STORAGE_DOWNLOAD_URL_TTL_SEC ?? "300", 10) || 300,
  };
  return _config;
}

/** True when every required env var is present — lets callers degrade
 *  gracefully (hide the file picker) instead of throwing at render time. */
export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.GCS_BUCKET &&
      process.env.GCS_PROJECT_ID &&
      process.env.GCS_CLIENT_EMAIL &&
      process.env.GCS_PRIVATE_KEY,
  );
}

function bucketRef(): Bucket {
  const cfg = readConfig();
  if (!_client) {
    _client = new Storage({
      projectId: cfg.projectId,
      credentials: { client_email: cfg.clientEmail, private_key: cfg.privateKey },
    });
  }
  return _client.bucket(cfg.bucket);
}

/** Test-only — drop the memoised client/config so env vars can be swapped. */
export function resetStorage(): void {
  _config = null;
  _client = null;
}

/** Server-side upload of an in-memory buffer. */
export async function putObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<void> {
  await bucketRef().file(params.key).save(Buffer.from(params.body), {
    contentType: params.contentType,
    // Small files — a resumable session would cost an extra round-trip.
    resumable: false,
  });
}

export interface ObjectHead {
  exists: boolean;
  contentLength?: number;
  contentType?: string;
}

/** Read object metadata. Used to confirm an upload actually landed before a
 *  row is written that claims it did. */
export async function headObject(key: string): Promise<ObjectHead> {
  const file = bucketRef().file(key);
  const [exists] = await file.exists();
  if (!exists) return { exists: false };
  const [md] = await file.getMetadata();
  return {
    exists: true,
    contentLength: md.size !== undefined ? Number(md.size) : undefined,
    contentType: md.contentType,
  };
}

/** Short-lived signed GET URL. `fileName` forces a download disposition;
 *  omit it so images and PDFs open inline. */
export async function getSignedDownloadUrl(params: {
  key: string;
  fileName?: string;
  expiresIn?: number;
}): Promise<{ url: string; expiresIn: number }> {
  const cfg = readConfig();
  const ttl = params.expiresIn ?? cfg.downloadUrlTtlSeconds;
  const [url] = await bucketRef()
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

/** Hard delete. Used to clean up an object whose DB row failed to write. */
export async function deleteObject(key: string): Promise<void> {
  await bucketRef().file(key).delete({ ignoreNotFound: true });
}
