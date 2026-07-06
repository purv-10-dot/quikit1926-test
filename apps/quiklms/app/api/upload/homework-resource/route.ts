import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix } from '@/lib/services/upload-service';

/**
 * POST /api/upload/homework-resource
 * Roles: TEACHER | LEARNER | TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN
 * Presigned-PUT minting (browser uploads bytes directly to S3).
 */
const schema = z.object({ fileName: z.string(), fileType: z.string(), fileSize: z.number().optional() });

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'LEARNER', 'TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  if (!actor.tenantId) throw BadRequest('Tenant ID is required');
  const { fileName, fileType, fileSize } = await parseBody(req, schema);
  const { uploadUrl, s3Key, permanentUrl } = await presignForPrefix(
    `tenants/${actor.tenantId}/homework`, fileName, fileType,
  );
  return json({
    success: true,
    data: { uploadUrl, url: permanentUrl, permanentUrl, s3Key, title: fileName, fileSize },
    message: 'Homework resource upload URL generated successfully',
  });
});
