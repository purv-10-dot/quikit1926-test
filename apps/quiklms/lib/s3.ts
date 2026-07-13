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
