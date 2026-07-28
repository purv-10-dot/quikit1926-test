import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';

/**
 * POST /api/upload/tus — any authenticated user (TenantGuard)
 *
 * STUBBED, matching the legacy placeholder. Full resumable uploads are served by
 * the standalone TUS server in /worker; this endpoint just acknowledges.
 */
export const POST = route(async (req) => {
  await requireAuth(req);
  return json(
    { success: true, message: 'TUS upload endpoint — integrate with @tus/server for full support' },
    201,
  );
});
