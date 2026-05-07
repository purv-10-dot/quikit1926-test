import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

/**
 * Singleton S3 client. Credentials come from env (set in `.env.local`):
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
 *
 * Used by /api/docs/upload to push images and by /api/docs/asset to mint
 * short-lived presigned GETs that the doc editor displays inline.
 */

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY in .env.local.",
    );
  }
  if (!client) {
    client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return client;
}

export function getBucket(): string {
  if (!bucket) throw new Error("AWS_S3_BUCKET is not set");
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
 * Build a tenant-scoped key. Putting orgId at the prefix makes it cheap
 * to reason about isolation and to wipe tenant data if needed.
 */
export function buildDocImageKey(orgId: string, projectId: string, mime: string): string {
  const ext = extFromMime(mime);
  return `tenants/${orgId}/quiktrack/docs/${projectId}/${randomUUID()}.${ext}`;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "private, max-age=300",
    }),
  );
}

/** 15-minute presigned GET URL — long enough for a page render + caching. */
export async function getPresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
  const s3 = getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn },
  );
}

/**
 * Validate that a key the client claims to own actually belongs to the
 * caller's tenant. Defense-in-depth — the prefix is part of the URL and
 * therefore not trustworthy on its own.
 */
export function keyBelongsToTenant(key: string, orgId: string): boolean {
  return key.startsWith(`tenants/${orgId}/`);
}
