import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const region = process.env.AWS_REGION ?? "us-east-1";
const bucket = process.env.AWS_S3_BUCKET ?? "";
const publicBase = process.env.AWS_S3_PUBLIC_URL?.replace(/\/$/, "") ?? "";

export const s3 = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

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
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  }));

  const url = publicBase
    ? `${publicBase}/${params.key}`
    : `https://${bucket}.s3.${region}.amazonaws.com/${params.key}`;

  return { key: params.key, url, bucket };
}

export async function getS3Object(key: string) {
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error("Empty S3 object");
  const arr = await res.Body.transformToByteArray();
  return { body: Buffer.from(arr), contentType: res.ContentType ?? "application/octet-stream", length: res.ContentLength ?? arr.length };
}
