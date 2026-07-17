import { z } from 'zod';
import { route, json, BadRequest, PayloadTooLarge } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { presignForPrefix } from '@/lib/services/upload-service';

/** Legacy: `limits: { fileSize: 50 * 1024 * 1024 }` (upload.controller.ts:467). */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * POST /api/upload/non-teaching-work-resource
 * Roles: TEACHER | TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN
 * Presigned-PUT minting (browser uploads bytes directly to S3).
 *
 * `fileSize` is required and capped at 50MB, restoring the legacy multer limit,
 * which surfaced as a 413 `'File too large'` — not a 400.
 *
 * Enforcement is on the CLIENT-DECLARED size, which the legacy backend did not
 * have to trust. See the upload-module note in GAP_REPORT for the residual gap.
 */
const schema = z.object({ fileName: z.string(), fileType: z.string(), fileSize: z.number() });

export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  if (!actor.orgId) throw BadRequest('Tenant ID is required');
  const { fileName, fileType, fileSize } = await parseBody(req, schema);
  if (fileSize > MAX_BYTES) throw PayloadTooLarge();
  const { uploadUrl, s3Key, permanentUrl } = await presignForPrefix(
    `tenants/${actor.orgId}/non-teaching-work`, fileName, fileType,
  );
  return json({
    success: true,
    data: { uploadUrl, url: permanentUrl, permanentUrl, s3Key, title: fileName, fileSize },
    message: 'Non-teaching work resource upload URL generated successfully',
  });
});
