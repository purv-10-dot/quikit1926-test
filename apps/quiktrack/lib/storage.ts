import { Storage, type Bucket } from "@google-cloud/storage";
import { randomUUID } from "crypto";

/**
 * Singleton Google Cloud Storage client. Credentials come from env
 * (set in `.env.local`):
 *   GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY
 *
 * The private key is stored with escaped newlines in the env file
 * (`\n` literals) and un-escaped here so the JWT signer accepts it.
 *
 * Used by /api/docs/upload to push images and by /api/docs/asset to mint
 * short-lived signed (V4) GETs that the doc editor displays inline.
 */

const projectId = process.env.GCS_PROJECT_ID;
const bucket = process.env.GCS_BUCKET;
const clientEmail = process.env.GCS_CLIENT_EMAIL;
// Support both raw multi-line keys and single-line keys with escaped newlines.
const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n");

let storage: Storage | null = null;

function getClient(): Storage {
  if (!projectId || !bucket || !clientEmail || !privateKey) {
    throw new Error(
      "GCS not configured. Set GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY in .env.local.",
    );
  }
  if (!storage) {
    storage = new Storage({
      projectId,
      credentials: { client_email: clientEmail, private_key: privateKey },
    });
  }
  return storage;
}

function getBucketRef(): Bucket {
  return getClient().bucket(getBucket());
}

export function getBucket(): string {
  if (!bucket) throw new Error("GCS_BUCKET is not set");
  return bucket;
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

export function isAllowedImageType(mime: string): boolean {
  return ALLOWED_IMAGE_TYPES.has(mime);
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

/**
 * Build a tenant-scoped object name. Putting orgId at the prefix makes it
 * cheap to reason about isolation and to wipe tenant data if needed.
 */
export function buildDocImageKey(orgId: string, projectId: string, mime: string): string {
  const ext = extFromMime(mime);
  return `tenants/${orgId}/quiktrack/docs/${projectId}/${randomUUID()}.${ext}`;
}

/** Per-issue attachment key. Preserves the original filename for download UX. */
export function buildIssueAttachmentKey(
  orgId: string,
  projectId: string,
  issueId: string,
  fileName: string,
): string {
  const safe = fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180) || "file";
  return `tenants/${orgId}/quiktrack/issues/${projectId}/${issueId}/${randomUUID()}-${safe}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await getBucketRef().file(key).save(Buffer.from(body), {
    contentType,
    // Small one-shot uploads — skip the resumable-session round trip.
    resumable: false,
    metadata: { cacheControl: "private, max-age=300" },
  });
}

/**
 * 15-minute signed (V4) GET URL — long enough for a page render + caching.
 * When `downloadFileName` is set, the URL forces the browser to download
 * (GCS returns `Content-Disposition: attachment; filename="..."`).
 */
export async function getPresignedGetUrl(
  key: string,
  expiresIn = 900,
  downloadFileName?: string,
): Promise<string> {
  const [url] = await getBucketRef()
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresIn * 1000,
      ...(downloadFileName
        ? {
            responseDisposition: `attachment; filename="${downloadFileName.replace(/"/g, "")}"`,
          }
        : {}),
    });
  return url;
}

/**
 * Validate that a key the client claims to own actually belongs to the
 * caller's tenant. Defense-in-depth — the prefix is part of the URL and
 * therefore not trustworthy on its own.
 */
export function keyBelongsToTenant(key: string, orgId: string): boolean {
  return key.startsWith(`tenants/${orgId}/`);
}
