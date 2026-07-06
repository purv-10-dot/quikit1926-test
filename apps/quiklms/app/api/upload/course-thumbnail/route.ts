import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix } from '@/lib/services/upload-service';

/**
 * POST /api/upload/course-thumbnail — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 * Presigned-PUT minting (browser uploads image bytes directly to S3).
 */
const schema = z.object({ fileName: z.string(), fileType: z.string() });

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  const { fileName, fileType } = await parseBody(req, schema);
  if (!fileType.startsWith('image/')) throw BadRequest('Only image files are allowed');
  const { uploadUrl, s3Key, permanentUrl } = await presignForPrefix('course-thumbnails', fileName, fileType);
  return json({
    success: true,
    data: { uploadUrl, url: permanentUrl, permanentUrl, s3Key },
    message: 'Course thumbnail upload URL generated successfully',
  });
});
