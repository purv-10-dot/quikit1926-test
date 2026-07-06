import { PutObjectCommand } from '@aws-sdk/client-s3';
import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { s3, S3_BUCKET, buildUploadKey, presignGet } from '@/lib/s3';

/**
 * POST /api/auth/profile/upload-photo — multipart upload of the caller's avatar.
 * Uploads to S3 and returns a (presigned) URL. Static route, so it is not
 * shadowed by the NextAuth catch-all.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);

  if (!S3_BUCKET) {
    throw BadRequest('File uploads are not configured on this server (AWS_S3_BUCKET is unset).');
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('No file provided');
  if (!file.type.startsWith('image/')) throw BadRequest('Only image files are allowed');
  if (file.size > 5 * 1024 * 1024) throw BadRequest('Image size must be less than 5MB');

  const key = buildUploadKey(actor.tenantId ?? 'global', file.name);
  const body = Buffer.from(await file.arrayBuffer());

  await s3.send(
    new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: file.type }),
  );

  const url = await presignGet(key);
  return json({ success: true, data: { url, permanentUrl: url, key } }, 201);
});
