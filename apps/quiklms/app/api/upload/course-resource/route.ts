import { z } from 'zod';
import { route, json, BadRequest, PayloadTooLarge } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix, getResourceTypeFromFile } from '@/lib/services/upload-service';

/** Legacy: `limits: { fileSize: 5 * 100 * 1024 * 1024 }` — 500MB (upload.controller.ts:318). */
const MAX_BYTES = 5 * 100 * 1024 * 1024;

/**
 * POST /api/upload/course-resource — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Re-platformed from a multipart upload to presigned-PUT minting: the browser
 * uploads the bytes directly to S3. Body carries file metadata only (no bytes).
 * SUPER_ADMIN without a tenant uploads to the master-courses prefix.
 *
 * `fileSize` is required and capped at 500MB, restoring the legacy multer limit.
 * That limit surfaced as multer's LIMIT_FILE_SIZE, which Nest turned into a
 * 413 `'File too large'` — hence PayloadTooLarge, not BadRequest.
 *
 * Enforcement is on the CLIENT-DECLARED size, which the legacy backend did not
 * have to trust. See the upload-module note in GAP_REPORT for the residual gap.
 */
const schema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number(),
});

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const { fileName, fileType, fileSize } = await parseBody(req, schema);
  if (fileSize > MAX_BYTES) throw PayloadTooLarge();

  const orgId = actor.orgId;
  const isMasterCourse = !orgId && actor.role === 'SUPER_ADMIN';
  if (!isMasterCourse && !orgId) throw BadRequest('Tenant ID is required for tenant-specific courses');

  const prefix = isMasterCourse
    ? 'master-courses/resources'
    : `tenants/${orgId}/course-resources`;
  const { uploadUrl, s3Key, permanentUrl } = await presignForPrefix(prefix, fileName, fileType);

  return json({
    success: true,
    data: {
      uploadUrl,
      url: permanentUrl,
      permanentUrl,
      s3Key,
      type: getResourceTypeFromFile(fileName, fileType),
      title: fileName,
      fileSize,
    },
    message: 'Course resource upload URL generated successfully',
  });
});
