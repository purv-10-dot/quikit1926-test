import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix, getResourceTypeFromFile } from '@/lib/services/upload-service';

/**
 * POST /api/upload/course-resource — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Re-platformed from a multipart upload to presigned-PUT minting: the browser
 * uploads the bytes directly to S3. Body carries file metadata only (no bytes).
 * SUPER_ADMIN without a tenant uploads to the master-courses prefix.
 */
const schema = z.object({
  fileName: z.string(),
  fileType: z.string(),
  fileSize: z.number().optional(),
});

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const { fileName, fileType, fileSize } = await parseBody(req, schema);

  const tenantId = actor.tenantId;
  const isMasterCourse = !tenantId && actor.role === 'SUPER_ADMIN';
  if (!isMasterCourse && !tenantId) throw BadRequest('Tenant ID is required for tenant-specific courses');

  const prefix = isMasterCourse
    ? 'master-courses/resources'
    : `tenants/${tenantId}/course-resources`;
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
