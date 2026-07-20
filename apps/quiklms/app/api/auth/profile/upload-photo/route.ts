import { route, json, BadRequest } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { S3_BUCKET, buildUploadKey, presignGet, putObject } from '@/lib/s3';

/**
 * POST /api/auth/profile/upload-photo — multipart upload of the caller's avatar.
 * Uploads to object storage (GCS) and returns a presigned URL. Static route, so
 * it is not shadowed by the NextAuth catch-all.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);

  if (!S3_BUCKET) {
    throw BadRequest('File uploads are not configured on this server (GCS_BUCKET is unset).');
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw BadRequest('No file provided');
  if (!file.type.startsWith('image/')) throw BadRequest('Only image files are allowed');
  if (file.size > 5 * 1024 * 1024) throw BadRequest('Image size must be less than 5MB');

  const key = buildUploadKey(actor.orgId ?? 'global', file.name);
  const body = Buffer.from(await file.arrayBuffer());

  await putObject(key, body, file.type);

  const url = await presignGet(key);
  return json({ success: true, data: { url, permanentUrl: url, key } }, 201);
});
