import { Storage, type Bucket } from "@google-cloud/storage";

/**
 * Singleton Google Cloud Storage client for HRMS document/asset uploads.
 * Credentials come from env (set in `.env.local`):
 *   GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY
 *
 * The private key is stored with escaped newlines in the env file (`\n`
 * literals) and un-escaped here so the JWT signer accepts it.
 *
 * Optional GCS_PUBLIC_URL overrides the public base (e.g. a CDN in front of
 * the bucket); otherwise we default to the canonical GCS object URL.
 *
 * The public `uploadToS3` / `getS3Object` names and `S3UploadResult` shape are
 * kept for call-site compatibility with the previous S3 implementation.
 */

const projectId = process.env.GCS_PROJECT_ID;
const bucket = process.env.GCS_BUCKET ?? "";
const clientEmail = process.env.GCS_CLIENT_EMAIL;
// Support both raw multi-line keys and single-line keys with escaped newlines.
const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n");
const publicBase = process.env.GCS_PUBLIC_URL?.replace(/\/$/, "") ?? "";

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
  return getClient().bucket(bucket);
}

export interface S3UploadResult {
  key: string;
  url: string;
  bucket: string;
}

export async function uploadToS3(params: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<S3UploadResult> {
  if (!bucket) throw new Error("GCS_BUCKET not configured");

  await getBucketRef().file(params.key).save(Buffer.from(params.body), {
    contentType: params.contentType,
    // Small one-shot uploads — skip the resumable-session round trip.
    resumable: false,
    metadata: { cacheControl: "private, max-age=300" },
  });

  const url = publicBase
    ? `${publicBase}/${params.key}`
    : `https://storage.googleapis.com/${bucket}/${params.key}`;

  return { key: params.key, url, bucket };
}

export async function getS3Object(key: string): Promise<{
  body: Buffer;
  contentType: string;
  length: number;
}> {
  if (!bucket) throw new Error("GCS_BUCKET not configured");
  const file = getBucketRef().file(key);
  const [body] = await file.download();
  const [meta] = await file.getMetadata();
  return {
    body,
    contentType: meta.contentType ?? "application/octet-stream",
    length: meta.size !== undefined ? Number(meta.size) : body.length,
  };
}

/**
 * Reverse of the URL built in `uploadToS3`: given a stored public URL, return
 * the object key, or null if the URL doesn't point at our bucket. Handles both
 * the optional GCS_PUBLIC_URL override and the canonical GCS object URL.
 */
export function extractKeyFromUrl(url: string): string | null {
  const prefixes = [
    publicBase ? `${publicBase}/` : "",
    `https://storage.googleapis.com/${bucket}/`,
  ].filter(Boolean);
  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      return decodeURIComponent(url.slice(prefix.length).split("?")[0]);
    }
  }
  return null;
}
