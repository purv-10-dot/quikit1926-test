/**
 * Object-storage helpers — presigned PUT/GET, same key format as the legacy
 * NestJS app:
 *   tenants/{orgId}/uploads/{uuid}-{fileName}
 *
 * BACKEND: Google Cloud Storage (bucket `quikit-bucket`), NOT AWS S3.
 *
 * The legacy backend and the initial port both targeted S3, but no S3 bucket or
 * IAM user was ever provisioned — `AWS_S3_BUCKET` was empty in every
 * environment, so every upload and every issued certificate silently produced an
 * empty URL. The rest of the platform (quikcrm, quikhrms, quikinfra, quiktrack)
 * already runs on GCS with a working service account, so the LMS was moved onto
 * the same bucket rather than standing up a second storage system.
 *
 * The MODULE PATH and every EXPORTED NAME are deliberately unchanged
 * (`lib/s3.ts`, `presignPut`, `presignGet`, `getObjectBuffer`,
 * `presignFromUrlOrKey`, `S3_BUCKET`) so the 13 call sites did not need to
 * change. Only the implementation swapped.
 *
 * PERMISSIONS: the service account has object-level access
 * (create / get / delete / sign) but NOT `storage.buckets.get`. Never call
 * `bucket.exists()` or any other bucket-metadata method here — it will 403 even
 * though object reads and writes succeed.
 *
 * Large files (>150MB) never pass through Next.js API routes; the browser
 * uploads directly to GCS via the presigned PUT URL, or to the TUS server in
 * /worker. This module only mints URLs and reads bytes.
 */
import { Storage } from '@google-cloud/storage';
import { randomUUID } from 'crypto';
import { optionalEnv } from './env';

/**
 * Vercel stores the PEM with literal backslash-n sequences (it is a
 * single-line env var), so they have to be turned back into real newlines or
 * the OpenSSL decoder rejects the key with `DECODER routines::unsupported`.
 * A key pasted with real newlines is left alone.
 */
function normalisePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, '\n');
}

const projectId = optionalEnv('GCS_PROJECT_ID');
const clientEmail = optionalEnv('GCS_CLIENT_EMAIL');
const privateKey = optionalEnv('GCS_PRIVATE_KEY');

export const storage = new Storage({
  projectId: projectId || undefined,
  credentials:
    clientEmail && privateKey
      ? { client_email: clientEmail, private_key: normalisePrivateKey(privateKey) }
      : undefined,
});

/**
 * Kept under the historical name `S3_BUCKET` because call sites and tests
 * reference it. `GCS_BUCKET` is the env var; `AWS_S3_BUCKET` is honoured as a
 * fallback only so a half-migrated environment does not silently resolve to
 * empty.
 */
export const S3_BUCKET = optionalEnv('GCS_BUCKET') || optionalEnv('AWS_S3_BUCKET');

function bucket() {
  if (!S3_BUCKET) throw new Error('GCS_BUCKET is not configured');
  return storage.bucket(S3_BUCKET);
}

/** Canonical object key — identical format to the legacy backend. */
export function buildUploadKey(orgId: string, fileName: string): string {
  return `tenants/${orgId}/uploads/${randomUUID()}-${fileName}`;
}

export async function presignPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
  const [url] = await bucket()
    .file(key)
    .getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + expiresIn * 1000,
      contentType,
    });
  return url;
}

export async function presignGet(key: string, expiresIn = 900): Promise<string> {
  const [url] = await bucket()
    .file(key)
    .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + expiresIn * 1000 });
  return url;
}

/**
 * Write an object. Replaces the `s3.send(new PutObjectCommand({...}))` calls
 * that were scattered across the upload, certificate and SCORM paths.
 *
 * `resumable: false` matters: the default resumable path issues an extra
 * session-start request and is slower for the small-to-medium payloads these
 * call sites write (avatars, certificate PDFs, unzipped SCORM entries).
 */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  await bucket()
    .file(key)
    .save(Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array | string), {
      contentType,
      resumable: false,
    });
}

/** Read an object from an EXPLICIT bucket — used when the bucket came from a stored URL. */
export async function getObjectBufferFrom(bucketName: string, key: string): Promise<Buffer> {
  const [buf] = await storage.bucket(bucketName).file(key).download();
  return buf;
}

/**
 * Read a whole object into memory. Used by the routes that must return the
 * BYTES rather than a URL — `GET /api/upload/welcome-kit` streamed the PDF in the
 * legacy backend and its callers are `<a download>` links, so a presigned URL is
 * not a substitute.
 *
 * Only for known-small, fixed-key objects. Large media must keep going direct to
 * the bucket via presigned URLs — never buffer it through a route.
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const [buf] = await bucket().file(key).download();
  return buf;
}

/**
 * Parse a storage URL into { bucket, key }, or null if it is not one of ours.
 * Recognises both GCS layouts plus the legacy S3 virtual-host form, because
 * rows written before the migration may still hold an `…s3….amazonaws.com` URL.
 *
 *   https://storage.googleapis.com/<bucket>/<key>
 *   https://<bucket>.storage.googleapis.com/<key>
 *   https://<bucket>.s3.<region>.amazonaws.com/<key>   (legacy)
 */
function parseStorageUrl(parsed: URL): { bucket: string; key: string } | null {
  const host = parsed.hostname;
  const path = decodeURIComponent(parsed.pathname.slice(1));

  if (host === 'storage.googleapis.com') {
    const slash = path.indexOf('/');
    if (slash <= 0) return null;
    return { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
  }

  const gcsHost = host.match(/^(.+?)\.storage\.googleapis\.com$/);
  if (gcsHost) return { bucket: gcsHost[1], key: path };

  const s3Host = host.match(/^(.+?)\.s3[.-].*\.amazonaws\.com$/);
  if (s3Host) return { bucket: s3Host[1], key: path };

  return null;
}

/**
 * Presign a GET from either a full storage URL (permanent or already-presigned)
 * or a bare key. Port of `S3PresignedService.generatePresignedUrl`
 * (`src/utils/s3-presigned.service.ts:31-65`).
 *
 * Legacy semantics, reproduced exactly:
 *  - falsy input              → null
 *  - `data:` URL              → returned unchanged
 *  - non-storage http(s) URL  → returned unchanged
 *  - storage URL              → re-presigned against the bucket parsed from the host
 *  - bare key                 → presigned against the configured bucket
 *  - any throw                → the input is returned unchanged (never throws)
 *
 * A legacy S3 URL is re-signed against GCS under the same bucket name, which
 * will simply fail closed and return the input unchanged if no such GCS bucket
 * exists — matching the old contract of never throwing at a render path.
 */
export async function presignFromUrlOrKey(
  urlOrKey: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!urlOrKey) return null;
  try {
    if (urlOrKey.startsWith('data:')) return urlOrKey;

    if (urlOrKey.startsWith('http')) {
      const target = parseStorageUrl(new URL(urlOrKey));
      // Not one of our buckets (e.g. an external image) — pass through.
      if (!target) return urlOrKey;
      const [url] = await storage
        .bucket(target.bucket)
        .file(target.key)
        .getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + expiresIn * 1000 });
      return url;
    }

    return await presignGet(urlOrKey, expiresIn);
  } catch {
    return urlOrKey;
  }
}
