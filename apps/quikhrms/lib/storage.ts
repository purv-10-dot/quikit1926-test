import { Storage, type Bucket } from "@google-cloud/storage";

/**
 * Singleton Google Cloud Storage client (same shape as quiktrack's
 * `lib/storage.ts`). Credentials come from env (set in `.env.local`):
 *   GCS_PROJECT_ID, GCS_BUCKET, GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY
 *
 * The private key is stored with escaped newlines in the env file (`\n`
 * literals) and un-escaped here so the JWT signer accepts it.
 *
 * The bucket is private: uploads go through `putObject`, downloads are served
 * either as raw bytes (`getObject`, used server-side for PDFs / email
 * attachments / AI extraction) or via short-lived signed (V4) GET URLs
 * (`getPresignedGetUrl`). The `/api/v1/hrms/uploads/proxy` route streams
 * objects to the browser using `getObject`, so nothing is ever public.
 */

const projectId = process.env.GCS_PROJECT_ID;
const bucket = process.env.GCS_BUCKET;
const clientEmail = process.env.GCS_CLIENT_EMAIL;
// Support both raw multi-line keys and single-line keys with escaped newlines.
const privateKey = process.env.GCS_PRIVATE_KEY?.replace(/\\n/g, "\n");
// Optional CDN / public base — only used to recognise legacy stored URLs.
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
  return getClient().bucket(getBucket());
}

function getBucket(): string {
  if (!bucket) throw new Error("GCS_BUCKET is not set");
  return bucket;
}

/**
 * Upload bytes to the bucket. Small one-shot uploads — skips the resumable
 * session round trip.
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await getBucketRef().file(key).save(Buffer.from(body), {
    contentType,
    resumable: false,
    metadata: { cacheControl: "private, max-age=300" },
  });
}

/** Download an object's raw bytes (server-side use: PDFs, email attachments, AI). */
export async function getObject(key: string): Promise<{
  body: Buffer;
  contentType: string;
  length: number;
}> {
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
 * Validate that a key the client claims to own actually belongs to the
 * caller's tenant. Defense-in-depth — the prefix is part of the URL and
 * therefore not trustworthy on its own.
 */
export function keyBelongsToTenant(key: string, orgId: string): boolean {
  return key.includes(`/${orgId}/`) || key.startsWith(`tenants/${orgId}/`);
}

/**
 * True when a stored file URL resolves to an object key inside the caller's
 * tenant. Accepts the internal upload-proxy URL and canonical GCS URLs; any
 * arbitrary external URL (or one pointing at another tenant's key) returns
 * false. Use this to reject SSRF / cross-tenant file references at write time.
 */
export function urlBelongsToTenant(url: string, orgId: string): boolean {
  const key = extractKeyFromUrl(url);
  return !!key && keyBelongsToTenant(key, orgId);
}

/**
 * Given a stored URL, return the object key, or null if it doesn't point at
 * our storage. Handles the internal upload-proxy URL, the optional
 * GCS_PUBLIC_URL override, and the canonical GCS object URL (for any legacy
 * public URLs still in the DB).
 */
export function extractKeyFromUrl(url: string): string | null {
  const proxyMatch = url.match(/\/uploads\/proxy\?.*?key=([^&]+)/i);
  if (proxyMatch) return decodeURIComponent(proxyMatch[1]);

  const prefixes = [
    publicBase ? `${publicBase}/` : "",
    bucket ? `https://storage.googleapis.com/${bucket}/` : "",
  ].filter(Boolean);
  for (const prefix of prefixes) {
    if (url.startsWith(prefix)) {
      return decodeURIComponent(url.slice(prefix.length).split("?")[0]);
    }
  }
  return null;
}
