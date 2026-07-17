/**
 * AWS S3 helpers — presigned PUT/GET, same key format as the legacy NestJS app:
 *   tenants/{orgId}/uploads/{uuid}-{fileName}
 *
 * Large files (>150MB) never pass through Next.js API routes; the browser
 * uploads directly to S3 via the presigned PUT URL, or to the TUS server in
 * /worker. This module only mints URLs and reads metadata.
 *
 * NOTE: Full implementation lands in Phase 3 (upload module). This is the
 * Phase 0 scaffold with the client + key helper in place.
 */
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { optionalEnv } from './env';

export const s3 = new S3Client({
  region: optionalEnv('AWS_REGION') || 'ap-south-1',
  credentials:
    optionalEnv('AWS_ACCESS_KEY_ID') && optionalEnv('AWS_SECRET_ACCESS_KEY')
      ? {
          accessKeyId: optionalEnv('AWS_ACCESS_KEY_ID'),
          secretAccessKey: optionalEnv('AWS_SECRET_ACCESS_KEY'),
        }
      : undefined,
});

export const S3_BUCKET = optionalEnv('AWS_S3_BUCKET');

/** Canonical S3 key — identical format to the legacy backend. */
export function buildUploadKey(orgId: string, fileName: string): string {
  return `tenants/${orgId}/uploads/${randomUUID()}-${fileName}`;
}

export async function presignPut(key: string, contentType: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

export async function presignGet(key: string, expiresIn = 900): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn });
}

/**
 * Read a whole S3 object into memory. Used by the routes that must return the
 * BYTES rather than a URL — `GET /api/upload/welcome-kit` streamed the PDF in the
 * legacy backend and its callers are `<a download>` links, so a presigned URL is
 * not a substitute.
 *
 * Only for known-small, fixed-key objects. Large media must keep going direct to
 * S3 via presigned URLs — never buffer it through a route.
 */
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
  if (!body?.transformToByteArray) throw new Error(`S3 object ${key} has no readable body`);
  return Buffer.from(await body.transformToByteArray());
}

/**
 * Presign a GET from either a full S3 URL (permanent or already-presigned) or a
 * bare key. Port of `S3PresignedService.generatePresignedUrl`
 * (`src/utils/s3-presigned.service.ts:31-65`).
 *
 * Legacy semantics, reproduced exactly:
 *  - falsy input            → null
 *  - `data:` URL            → returned unchanged
 *  - non-S3 http(s) URL     → returned unchanged
 *  - S3 URL                 → re-presigned against the bucket parsed from the host
 *  - bare key               → presigned against the configured bucket
 *  - any throw              → the input is returned unchanged (never throws)
 */
export async function presignFromUrlOrKey(
  urlOrKey: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!urlOrKey) return null;
  try {
    if (urlOrKey.startsWith('data:')) return urlOrKey;

    if (urlOrKey.startsWith('http')) {
      const parsed = new URL(urlOrKey);
      const hostMatch = parsed.hostname.match(/^(.+?)\.s3[.-].*\.amazonaws\.com$/);
      if (hostMatch) {
        const bucket = hostMatch[1];
        const key = decodeURIComponent(parsed.pathname.slice(1));
        return await getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
      }
      // Not an S3 URL (e.g. an external image) — pass through.
      return urlOrKey;
    }

    return await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: urlOrKey }), { expiresIn });
  } catch {
    return urlOrKey;
  }
}
