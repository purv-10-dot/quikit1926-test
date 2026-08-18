import { route, json, BadRequest, PayloadTooLarge } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { readUploadIntent, resolveUpload, getResourceTypeFromFile } from '@/lib/services/upload-service';
import { MAX_COURSE_RESOURCE_BYTES } from '@/lib/constants/uploads';

/**
 * 50MB, shared with the picker that chooses the file.
 *
 * The legacy limit was `limits: { fileSize: 5 * 100 * 1024 * 1024 }` — 500MB
 * (upload.controller.ts:318) — while the resource picker allowed 5GB, so a file
 * between the two was accepted by the UI, uploaded in full, and only then
 * refused. Both now read one constant, and it is the same 50MB the homework and
 * non-teaching-work routes already used.
 */
const MAX_BYTES = MAX_COURSE_RESOURCE_BYTES;

/**
 * POST /api/upload/course-resource — ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Accepts either shape (see `readUploadIntent`): multipart, and the server
 * stores the bytes; or JSON metadata, and the response carries a presigned PUT
 * for the browser to send them itself. ADMIN without a tenant uploads to
 * the master-courses prefix.
 *
 * `fileSize` is capped at 50MB (see MAX_BYTES). Over-limit surfaces the way the
 * legacy multer `LIMIT_FILE_SIZE` did, which Nest turned into a 413
 * `'File too large'` — hence PayloadTooLarge, not BadRequest.
 *
 * On the JSON path enforcement is on the CLIENT-DECLARED size, which the legacy
 * backend did not have to trust; on the multipart path it is the real byte
 * count. See the upload-module note in GAP_REPORT for the residual gap.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const intent = await readUploadIntent(req);
  if (intent.fileSize > MAX_BYTES) throw PayloadTooLarge();

  const orgId = actor.orgId;
  const isMasterCourse = !orgId && actor.role === 'ADMIN';
  if (!isMasterCourse && !orgId) throw BadRequest('Tenant ID is required for tenant-specific courses');

  const prefix = isMasterCourse
    ? 'master-courses/resources'
    : `tenants/${orgId}/course-resources`;
  const { uploadUrl, s3Key, permanentUrl, previewUrl } = await resolveUpload(prefix, intent);

  return json({
    success: true,
    data: {
      uploadUrl,
      url: permanentUrl,
      permanentUrl,
      previewUrl,
      s3Key,
      type: getResourceTypeFromFile(intent.fileName, intent.fileType),
      title: intent.fileName,
      fileSize: intent.fileSize,
    },
    message: 'Course resource upload URL generated successfully',
  });
});
