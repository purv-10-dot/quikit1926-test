import { route, ApiError } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';

/**
 * POST /api/upload/scorm — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * STUBBED: the legacy handler received a multipart .zip, extracted every entry,
 * uploaded the tree to S3, and injected a SCORM API bridge into the entry HTML.
 * This is large-binary + per-file processing that belongs in the upload worker
 * (direct-to-S3), not a Next.js route body. Auth/roles preserved; returns 501.
 */
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['SUPER_ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN']);
  throw new ApiError(
    501,
    'SCORM package processing is handled by the upload worker, not via this route.',
    'Not Implemented',
  );
});
