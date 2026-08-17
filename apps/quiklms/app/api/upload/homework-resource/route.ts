import { route, json, BadRequest, PayloadTooLarge } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadIntent, resolveUpload } from '@/lib/services/upload-service';
import { MAX_HOMEWORK_BYTES } from '@/lib/constants/uploads';

/** Legacy: `limits: { fileSize: 50 * 1024 * 1024 }` (upload.controller.ts:402). */
const MAX_BYTES = MAX_HOMEWORK_BYTES;

/**
 * POST /api/upload/homework-resource
 * Roles: TEACHER | LEARNER | TENANT_ADMIN | SUB_ADMIN | ADMIN
 *
 * Accepts multipart (server stores the bytes) or JSON metadata (response
 * carries a presigned PUT for the browser to send them itself).
 *
 * `fileSize` is capped at 50MB, restoring the legacy multer limit, which
 * surfaced as a 413 `'File too large'` — not a 400.
 *
 * On the JSON path enforcement is on the CLIENT-DECLARED size, which the legacy
 * backend did not have to trust. See the upload-module note in GAP_REPORT.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'LEARNER', 'TENANT_ADMIN', 'SUB_ADMIN', 'ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID is required');
  const intent = await readUploadIntent(req);
  if (intent.fileSize > MAX_BYTES) throw PayloadTooLarge();
  const { uploadUrl, s3Key, permanentUrl, previewUrl } = await resolveUpload(
    `tenants/${actor.orgId}/homework`, intent,
  );
  return json({
    success: true,
    data: {
      uploadUrl,
      url: permanentUrl,
      permanentUrl,
      previewUrl,
      s3Key,
      title: intent.fileName,
      fileSize: intent.fileSize,
    },
    message: 'Homework resource upload URL generated successfully',
  });
});
