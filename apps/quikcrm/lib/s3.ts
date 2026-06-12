import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3 client for CRM document attachments.
 * Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
 */

const region = process.env.AWS_REGION;
const bucket = process.env.AWS_S3_BUCKET;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.",
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

export function isS3Configured(): boolean {
  return Boolean(region && bucket && accessKeyId && secretAccessKey);
}

/** Virtual-hosted public URL (works when bucket/objects are publicly readable). */
export function buildPublicObjectUrl(key: string): string {
  const b = getBucket();
  const r = region ?? "ap-south-1";
  const encoded = key.split("/").map((seg) => encodeURIComponent(seg)).join("/");
  return `https://${b}.s3.${r}.amazonaws.com/${encoded}`;
}

export function isCrmDocumentS3Key(key: string): boolean {
  return key.startsWith("crm-documents/");
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

export async function deleteObject(key: string): Promise<void> {
  if (!isCrmDocumentS3Key(key)) {
    console.warn("[crm-s3] skip delete — not an S3 key:", key);
    return;
  }
  const s3 = getClient();
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: getBucket(),
        Key: key,
      }),
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "delete failed";
    console.error("[crm-s3] deleteObject failed", { key, message });
    throw error;
  }
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const s3 = getClient();
  const out = await s3.send(
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
  );
  if (!out.Body) throw new Error("Empty S3 object body");
  const bytes = await out.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/** Presigned GET for private buckets (file download redirect). */
export async function getPresignedGetUrl(key: string, expiresIn = 900): Promise<string> {
  const s3 = getClient();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn },
  );
}
