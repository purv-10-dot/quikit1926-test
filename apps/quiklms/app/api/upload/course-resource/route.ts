import { route, json, BadRequest, PayloadTooLarge } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadIntent, resolveUpload, getResourceTypeFromFile } from '@/lib/services/upload-service';

/** Legacy: `limits: { fileSize: 5 * 100 * 1024 * 1024 }` — 500MB (upload.controller.ts:318). */
const MAX_BYTES = 5 * 100 * 1024 * 1024;

/**
 * POST /api/upload/course-resource — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Accepts either shape (see `readUploadIntent`): multipart, and the server
 * stores the bytes; or JSON metadata, and the response carries a presigned PUT
 * for the browser to send them itself. SUPER_ADMIN without a tenant uploads to
 * the master-courses prefix.
 *
 * `fileSize` is capped at 500MB, restoring the legacy multer limit. That limit
 * surfaced as multer's LIMIT_FILE_SIZE, which Nest turned into a 413
 * `'File too large'` — hence PayloadTooLarge, not BadRequest.
 *
 * On the JSON path enforcement is on the CLIENT-DECLARED size, which the legacy
 * backend did not have to trust; on the multipart path it is the real byte
 * count. See the upload-module note in GAP_REPORT for the residual gap.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const intent = await readUploadIntent(req);
  if (intent.fileSize > MAX_BYTES) throw PayloadTooLarge();

  const orgId = actor.orgId;
  const isMasterCourse = !orgId && actor.role === 'SUPER_ADMIN';
  if (!isMasterCourse && !orgId) throw BadRequest('Tenant ID is required for tenant-specific courses');

  const prefix = isMasterCourse
    ? 'master-courses/resources'
    : `tenants/${orgId}/course-resources`;
  const { uploadUrl, s3Key, permanentUrl } = await resolveUpload(prefix, intent);

  return json({
    success: true,
    data: {
      uploadUrl,
      url: permanentUrl,
      permanentUrl,
      s3Key,
      type: getResourceTypeFromFile(intent.fileName, intent.fileType),
      title: intent.fileName,
      fileSize: intent.fileSize,
    },
    message: 'Course resource upload URL generated successfully',
  });
});
