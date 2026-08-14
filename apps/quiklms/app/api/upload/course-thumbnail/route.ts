import { route, json, BadRequest } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadIntent, resolveUpload } from '@/lib/services/upload-service';
import { MAX_THUMBNAIL_BYTES } from '@/lib/constants/uploads';

/** Legacy: `if (file.size > 5 * 1024 * 1024)` (upload.controller.ts:189). */
const MAX_BYTES = MAX_THUMBNAIL_BYTES;

/**
 * POST /api/upload/course-thumbnail — ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Accepts multipart (server stores the bytes) or JSON metadata (response
 * carries a presigned PUT). Thumbnails are capped at 5MB, so in practice every
 * one of them takes the proxied path and never touches the bucket directly.
 *
 * The size cap restores the legacy check at `upload.controller.ts:189-191`.
 * That check was a manual `file.size >` test, so it returns 400 with the legacy
 * message — not the 413 that the multer-`limits` endpoints (course-resource /
 * homework / non-teaching) return.
 *
 * On the JSON path enforcement is on the CLIENT-DECLARED size, which the legacy
 * backend did not have to trust. See the upload-module note in GAP_REPORT.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const intent = await readUploadIntent(req);
  // Order matches the legacy handler: type first, then size.
  if (!intent.fileType.startsWith('image/')) throw BadRequest('Only image files are allowed');
  if (intent.fileSize > MAX_BYTES) throw BadRequest('File size must be less than 5MB');
  const { uploadUrl, s3Key, permanentUrl, previewUrl } = await resolveUpload('course-thumbnails', intent);
  return json({
    success: true,
    data: { uploadUrl, url: permanentUrl, permanentUrl, previewUrl, s3Key },
    message: 'Course thumbnail upload URL generated successfully',
  });
});
