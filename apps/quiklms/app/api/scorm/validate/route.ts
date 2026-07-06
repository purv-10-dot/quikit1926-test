import { route, ApiError } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';

/**
 * POST /api/scorm/validate — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN | TEACHER
 *
 * STUBBED: validates an uploaded SCORM .zip by parsing its manifest. Large
 * binary upload — handled by the upload worker, not a route body. Auth/roles
 * preserved.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN', 'TEACHER']);
  throw new ApiError(
    501,
    'SCORM validation is handled by the upload worker (direct-to-S3), not via this route.',
    'Not Implemented',
  );
});
