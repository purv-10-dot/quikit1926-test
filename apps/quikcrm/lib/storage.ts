import { Storage, type Bucket } from "@google-cloud/storage";

/**
 * Google Cloud Storage client for CRM document attachments.
 * Env: GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY
 *
 * The private key is stored with escaped newlines in the env file
 * (`\n` literals) and un-escaped here so the JWT signer accepts it.
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
      "GCS not configured. Set GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY.",
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

export function isS3Configured(): boolean {
  return Boolean(projectId && bucket && clientEmail && privateKey);
}

/** Virtual-hosted public URL (works when bucket/objects are publicly readable). */
export function buildPublicObjectUrl(key: string): string {
  const b = getBucket();
  const encoded = key.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `https://storage.googleapis.com/${b}/${encoded}`;
}

export function isCrmDocumentS3Key(key: string): boolean {
  return key.startsWith("crm-documents/");
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

export async function deleteObject(key: string): Promise<void> {
  if (!isCrmDocumentS3Key(key)) {
    console.warn("[crm-gcs] skip delete — not a storage key:", key);
    return;
  }
  try {
    await getBucketRef().file(key).delete();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "delete failed";
    console.error("[crm-gcs] deleteObject failed", { key, message });
    throw error;
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const [buf] = await getBucketRef().file(key).download();
  return buf;
}

/** Presigned (V4) GET for private buckets (file download redirect). */
export async function getPresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
  const [url] = await getBucketRef()
    .file(key)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + expiresIn * 1000,
    });
  return url;
}
