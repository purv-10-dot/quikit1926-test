import { route, ApiError } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';

/**
 * POST /api/scorm/parse — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN | TEACHER
 *
 * STUBBED: parses an uploaded SCORM .zip (adm-zip + xml2js) to read its
 * imsmanifest. SCORM packages are large binary uploads that must not stream
 * through a Next.js route body — they are handled by the upload worker which
 * extracts + uploads to S3. Auth/roles preserved; returns 501 here.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN', 'TEACHER']);
  throw new ApiError(
    501,
    'SCORM package parsing is handled by the upload worker (direct-to-S3), not via this route.',
    'Not Implemented',
  );
});
