import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix } from '@/lib/services/upload-service';

/** Legacy: `if (file.size > 5 * 1024 * 1024)` (upload.controller.ts:189). */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/upload/course-thumbnail — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 * Presigned-PUT minting (browser uploads image bytes directly to S3).
 *
 * `fileSize` is required and capped at 5MB, restoring the legacy check at
 * `upload.controller.ts:189-191`. That check was a manual `file.size >` test, so
 * it returns 400 with the legacy message — not the 413 that the multer-`limits`
 * endpoints (course-resource / homework / non-teaching) return.
 *
 * Enforcement is on the CLIENT-DECLARED size, which the legacy backend did not
 * have to trust. See the upload-module note in GAP_REPORT for the residual gap.
 */
const schema = z.object({ fileName: z.string(), fileType: z.string(), fileSize: z.number() });

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const { fileName, fileType, fileSize } = await parseBody(req, schema);
  // Order matches the legacy handler: type first, then size.
  if (!fileType.startsWith('image/')) throw BadRequest('Only image files are allowed');
  if (fileSize > MAX_BYTES) throw BadRequest('File size must be less than 5MB');
  const { uploadUrl, s3Key, permanentUrl } = await presignForPrefix('course-thumbnails', fileName, fileType);
  return json({
    success: true,
    data: { uploadUrl, url: permanentUrl, permanentUrl, s3Key },
    message: 'Course thumbnail upload URL generated successfully',
  });
});
