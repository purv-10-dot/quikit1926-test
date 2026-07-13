import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix } from '@/lib/services/upload-service';

/**
 * POST /api/upload/non-teaching-work-resource
 * Roles: TEACHER | TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN
 * Presigned-PUT minting (browser uploads bytes directly to S3).
 */
const schema = z.object({ fileName: z.string(), fileType: z.string(), fileSize: z.number().optional() });

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID is required');
  const { fileName, fileType, fileSize } = await parseBody(req, schema);
  const { uploadUrl, s3Key, permanentUrl } = await presignForPrefix(
    `tenants/${actor.orgId}/non-teaching-work`, fileName, fileType,
  );
  return json({
    success: true,
    data: { uploadUrl, url: permanentUrl, permanentUrl, s3Key, title: fileName, fileSize },
    message: 'Non-teaching work resource upload URL generated successfully',
  });
});
